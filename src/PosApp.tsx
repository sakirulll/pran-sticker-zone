import { useEffect, useRef } from "react";
import { ORIGINAL_APP } from "./appShell";
import { canEncode, code128Svg, fitModule } from "./barcode";
import { canUseBluetooth, canUseSerial, connectBluetooth, connectSerial, drawLabel, tsplJob, type LabelSpec, type PrinterLink } from "./labelPrinter";
import { hostingApi, type HostingUser, type ShopBackup, type Subscription } from "./hostingApi";
import { currentLanguage, switchLanguage, translate } from "./i18n";
import { drawReceipt, escposJob, PAPER_DOTS, pictureCanvas, tsplReceiptJob, type Receipt } from "./receiptPrinter";
import { clearOfflineShop, readOfflineShop, writeOfflineShop } from "./offlineStore";
import { buildShopData, chunkChanges, ShopSync, type RecordRow, type StoredRow } from "./shopSync";
import { canUseShop, daysLeft, escapeHtml, money, mountSubscriptionPanel, resendVerification, subscriptionBadge } from "./subscriptionPanel";

type AnyData = Record<string, any>;

// The shop itself: every screen after login. It draws into one container and
// keeps the whole shop in memory, saving through ShopSync.
export function POSApp({ user, onLogout }: { user: HostingUser; onLogout: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const boot = async () => {
    let sessionUser = user;
    let cloudData: AnyData | null = null;
    let membership: AnyData | null = null;
    let isWorkspaceOwner = false;
    let loadedRevision = 0;
    let loadedRecords: RecordRow[] = [];
    let registeredShopName = "";
    let subscription: Subscription = { state: "trial", secondsLeft: 0, emailVerified: true };
    let isAdmin = false;
    // Set when the shop starts from the copy kept on this device instead of the server's.
    let localRows: StoredRow[] | null = null;
    let startedOffline = false;
    const kept = await readOfflineShop(user.id);
    const keptHasUnsent = Boolean(kept) && ShopSync.restore(() => kept!.data, kept!.rev, kept!.rows).collectChanges().length > 0;
    const startFromKept = () => {
      localRows = kept!.rows;
      loadedRevision = kept!.rev;
      cloudData = kept!.data;
    };
    try {
      const shop = await hostingApi.loadShop();
      registeredShopName = shop.shopName;
      subscription = shop.subscription;
      isAdmin = shop.admin;
      membership = { roleId: shop.membership.roleId };
      isWorkspaceOwner = shop.membership.owner;
      if (keptHasUnsent) {
        // Changes made without internet were never sent. Start from them; the
        // first sync sends them and brings in what happened on the server meanwhile.
        startFromKept();
      } else {
        loadedRevision = shop.rev;
        loadedRecords = shop.records;
        cloudData = buildShopData(shop.records);
      }
    } catch (error) {
      const unreachable = (error as { status?: number })?.status === undefined;
      if (unreachable && kept) {
        startedOffline = true;
        registeredShopName = kept.shopName;
        subscription = kept.subscription;
        isAdmin = kept.admin;
        membership = { roleId: kept.membership.roleId };
        isWorkspaceOwner = kept.membership.owner;
        startFromKept();
      } else {
      console.error("Could not load shop data", error);
      const message = error instanceof Error ? error.message : "Could not load shop data.";
      const notice = document.createElement("div");
      notice.className = "auth-feedback error";
      notice.style.cssText = "margin:48px auto;max-width:600px";
      notice.textContent = unreachable ? "No internet connection. Open the shop once while online and it will work offline afterwards." : message;
      root.replaceChildren(notice);
      return;
      }
    }
    const uploadProductImage = async (_productId: any, imageData: string) => {
      const uploaded = await hostingApi.uploadImage(imageData);
      return { image: uploaded.url, imagePath: uploaded.url };
    };
    const removeProductImage = async (path: string) => {
      if (path?.startsWith("/uploads/")) await hostingApi.deleteImage(path);
    };
    if (disposed) return;

    // No trial or paid period left: show how to pay instead of the shop.
    if (!canUseShop(subscription)) {
      root.innerHTML = `<main class="blocked-page"><div class="blocked-card"><h1>${escapeHtml(registeredShopName || "Your shop")}</h1><p>HishabPOS subscription</p><div id="subscriptionPanel"></div><button class="blocked-logout" id="blockedLogout" type="button">Log Out</button></div></main>`;
      const panel = root.querySelector<HTMLElement>("#subscriptionPanel")!;
      if (subscription.state === "unverified") {
        // The owner is told where the link went and can ask for it again; staff can only wait.
        panel.className = "plan-panel";
        panel.innerHTML = isWorkspaceOwner
          ? `<p class="plan-status bad">Confirm your email address to keep using the shop.</p><p>We sent a link to <b>${escapeHtml(user.email)}</b>. Open it, then reload this page. Check the spam folder too.</p><p><button class="plan-buy" id="resendVerify" type="button" style="max-width:260px">Send the link again</button></p><p id="resendResult" role="status"></p>`
          : `<p class="plan-status bad">The shop owner needs to confirm the email address before the shop can be used.</p>`;
        panel.querySelector("#resendVerify")?.addEventListener("click", () => void resendVerification(panel.querySelector<HTMLElement>("#resendResult")!));
      } else {
        void mountSubscriptionPanel(panel);
      }
      root.querySelector("#blockedLogout")!.addEventListener("click", () => {
        void hostingApi.logout().catch((error) => console.error("Could not log out", error)).then(onLogout);
      });
      return;
    }

    root.innerHTML = ORIGINAL_APP;

    const $ = (q: string): any => document.querySelector(q);

    const today = () => new Date().toISOString().slice(0, 10);

    const esc = (s: any) =>
      String(s ?? "").replace(
        /[&<>"]/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
          })[c] || c,
      );

    let CURRENCY_SYMBOL = String.fromCharCode(2547);
    const tk = (n: any) => (+n || 0).toFixed(2) + CURRENCY_SYMBOL;

    const sum = (a: any[], f: (x: any) => any) =>
      a.reduce((t, x) => t + (+f(x) || 0), 0);

    function seed(): AnyData {
      let i = 0;

      const m = (...n: string[]) =>
        n.map((x) => ({
          id: ++i,
          name: x,
          status: "Active",
        }));

      return {
        seq: 100,

        categories: m(
          "General",
        ),

        brands: m(
          "No Brand",
        ),

        units: m(
          "Pcs",
          "Set",
          "Box",
          "Kg",
        ),

        products: [],

        customers: [
          {
            id: 30,
            name: "Walk-in Customer",
            phone: "",
            address: "",
          },
        ],

        suppliers: [],

        warehouses: [
          {
            id: 32,
            name: "Main Warehouse",
            location: "",
          },
        ],

        sales: [],
        purchases: [],
        sr: [],
        pr: [],
        expenses: [],
        employees: [],
        salary: [],
        transfers: [],

        currencies: [
          { id: 40, name: "Bangladeshi Taka", code: "BDT", symbol: String.fromCharCode(2547), rate: 1, status: "Active" },
        ],

        roles: [
          { id: 41, name: "Admin", permissions: ["All permissions"] },
          { id: 42, name: "Cashier", permissions: ["Dashboard", "Sales", "Customers"] },
        ],

        notes: [],

        settings: {
          currencyId: 40,
          taxRate: 0,
          invoiceFooter: "Thank you for your purchase!",
          notifications: { lowStock: true, dueReminders: true, sales: true, purchases: true, expenses: true },
        },

        user: {
          name: user.display_name,
          email: user.email,
          shop: registeredShopName || "My Shop",
          open: 0,
          roleId: 41,
          printer: {
  paperSize: "58mm",
  printerName: "",
},
        },
      };
    }

    let D: AnyData;

    try {
      D = cloudData || seed();
    } catch {
      D = seed();
    }

    if (!D || typeof D !== "object") {
      D = seed();
    } else {
      const defaults = seed();
      D = { ...defaults, ...D };
      for (const key of Object.keys(defaults)) {
        if (Array.isArray(defaults[key]) && !Array.isArray(D[key])) {
          D[key] = defaults[key];
        }
      }
      D.settings = {
        ...defaults.settings,
        ...(D.settings || {}),
        notifications: { ...defaults.settings.notifications, ...(D.settings?.notifications || {}) },
      };
      D.user = { ...defaults.user, ...(D.user || {}) };
      if (!Number.isFinite(D.seq)) D.seq = defaults.seq;
    }

    const activeRoleId = isWorkspaceOwner
      ? D.user.roleId
      : (membership?.roleId ?? null);

    CURRENCY_SYMBOL = D.currencies?.find((currency: any) => currency.id == D.settings.currencyId)?.symbol || String.fromCharCode(2547);

    // Saving sends only the records that changed, and each exchange also brings
    // in what other devices saved, so several people can work at the same time.
    const shopSync = localRows ? ShopSync.restore(() => D, loadedRevision, localRows) : new ShopSync(() => D, loadedRevision, loadedRecords);

    // Every change is also written to this device, so closing the browser or
    // losing internet does not lose it.
    let keptOnDevice = false;
    let keepTimer: number | undefined;
    const keepNow = async () => {
      window.clearTimeout(keepTimer);
      keptOnDevice = await writeOfflineShop(user.id, {
        rev: shopSync.rev,
        rows: shopSync.exportRows(),
        data: D,
        shopName: registeredShopName,
        membership: { owner: isWorkspaceOwner, roleId: membership?.roleId ?? null },
        subscription,
        admin: isAdmin,
      });
    };
    const keepSoon = () => {
      window.clearTimeout(keepTimer);
      keepTimer = window.setTimeout(() => void keepNow(), 300);
    };

    const offlineBar = document.createElement("div");
    offlineBar.style.cssText = "padding:8px 16px;background:#fef9c3;color:#854d0e;font-size:13px;font-weight:600;text-align:center";
    offlineBar.textContent = "No internet. You can keep working: changes are saved on this device and sent when the internet is back.";
    offlineBar.hidden = !startedOffline;
    document.querySelector(".main")?.prepend(offlineBar);
    // Keep a first copy straight away, and send anything left over from an offline session.
    window.setTimeout(() => { keepSoon(); if (localRows) void runSync(); }, 0);

    let syncing = false;
    let syncAgain = false;
    let unsaved = false;
    let retryTimer: number | undefined;
    let lastSaveWarning = 0;
    const runSync = async () => {
      if (syncing) { syncAgain = true; return; }
      syncing = true;
      window.clearTimeout(retryTimer);
      try {
        do {
          syncAgain = false;
          for (const batch of chunkChanges(shopSync.collectChanges())) {
            const result = await hostingApi.syncShop(shopSync.rev, batch);
            shopSync.commit(batch, result.rev, result.remote);
          }
        } while (syncAgain);
        unsaved = false;
        offlineBar.hidden = true;
        updateBell();
        keepSoon();
      } catch (error) {
        console.error("Could not sync shop data", error);
        const status = (error as { status?: number })?.status;
        if (status === 401) {
          toast("Your login has expired. Please log in again.");
          onLogout();
          return;
        }
        // 402: the subscription ran out while the shop was open; reloading shows how to pay.
        if (status === 409 || status === 402) {
          // 409: the copy on this device no longer lines up with the server; start again from the server's.
          if (status === 409) await clearOfflineShop(user.id);
          unsaved = false;
          window.location.reload();
          return;
        }
        if (status === undefined) offlineBar.hidden = false;
        if (!unsaved) return;
        // Nothing is lost: the change stays on this device and is sent again shortly.
        retryTimer = window.setTimeout(() => void runSync(), 5000);
        // Without internet the bar above already says what is happening.
        if (status !== undefined && Date.now() - lastSaveWarning > 30000) {
          lastSaveWarning = Date.now();
          toast(status === 413 || status === 403 || status === 400
            ? (error as Error).message
            : "Not saved to the server yet. It will retry automatically.");
        }
      } finally {
        syncing = false;
      }
    };
    const save = () => {
      unsaved = true;
      updateBell();
      keepSoon();
      void runSync();
    };

    // Picks up other devices' changes while this one is idle.
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void runSync();
    }, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void runSync(); };
    // Only worth a warning when the change is neither on the server nor kept on this device.
    const warnUnsaved = (event: BeforeUnloadEvent) => { if (unsaved && !keptOnDevice) event.preventDefault(); };
    const onOnline = () => void runSync();
    const onHide = () => { if (document.visibilityState === "hidden") void keepNow(); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", warnUnsaved);
    window.addEventListener("online", onOnline);
    const stopSync = () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(retryTimer);
      window.clearTimeout(keepTimer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", warnUnsaved);
      window.removeEventListener("online", onOnline);
    };

    // Ids must not clash between devices working at the same time, so they come
    // from the clock. The shop counter still advances because invoice numbers use it.
    let lastId = 0;
    const uid = () => {
      D.seq++;
      lastId = Math.max(lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
      return lastId;
    };

    const nm = (k: string, id: any) =>
      (D[k]?.find((x: any) => x.id == id) || {}).name || "-";

    const prod = (id: any) =>
      D.products.find((p: any) => p.id == id);

    // A product is low when its stock is at or under its own alert quantity
    // (10 when none was set). The dashboard, the bell and the sale message all use this.
    const alertQty = (product: any) => (+product.lowAlert > 0 ? +product.lowAlert : 10);
    const isLowStock = (product: any) => (+product.stock || 0) <= alertQty(product);
    const lowStockProducts = () => D.products.filter(isLowStock);

    // The bell: what needs attention now, according to the alerts switched on in Settings.
    const updateBell = () => {
      const button = $("#bellBtn");
      const panel = $("#bellPanel");
      if (!button || !panel) return;
      const low = D.settings.notifications.lowStock ? lowStockProducts() : [];
      const dues = D.settings.notifications.dueReminders ? D.sales.filter((sale: any) => +sale.due > 0 && !sale.ret) : [];
      const count = low.length + dues.length;
      $("#bellCount").textContent = String(count);
      button.classList.toggle("has-alerts", count > 0);
      const shown = 30;
      panel.innerHTML = count === 0
        ? "<p>Nothing needs your attention.</p>"
        : (low.length ? `<h4>Low Stock (${low.length})</h4>${low.slice(0, shown).map((product: any) => `<a href="#stocks"><span>${esc(product.name)}</span><small>${(+product.stock || 0) <= 0 ? "Out of stock" : `Stock ${+product.stock}`} · Alert Qty ${alertQty(product)}</small></a>`).join("")}` : "")
          + (dues.length ? `<h4>Customer Due (${dues.length})</h4>${dues.slice(0, shown).map((sale: any) => `<a href="#dues"><span>${esc(sale.party || "Customer")}</span><small>${esc(sale.inv)} · ${tk(sale.due)}</small></a>`).join("")}` : "");
    };

    const toast = (t: string) => {
      const e = $("#toast");
      if (!e) return;

      e.textContent = t;
      e.style.display = "block";

      clearTimeout(e.t);

      e.t = setTimeout(() => {
        e.style.display = "none";
      }, 2200);
    };

    if (!cloudData && isWorkspaceOwner) {
      save();
    }

    const C: AnyData = {
      products: [
        "Product",
        [
          ["name", "Product Name"],
          ["code", "Code"],
          ["brand", "Brand", "brands"],
          ["category", "Category", "categories"],
          ["unit", "Unit", "units"],
          ["buy", "Purchase Price", "$"],
          ["sell", "Sale Price", "$"],
          ["stock", "Stock", "n"],
        ],
      ],

      categories: [
        "Category",
        [
          ["name", "Name"],
          ["status", "Status"],
        ],
      ],

      brands: [
        "Brand",
        [
          ["name", "Name"],
          ["status", "Status"],
        ],
      ],

      units: [
        "Unit",
        [
          ["name", "Name"],
          ["status", "Status"],
        ],
      ],

      customers: [
        "Customer",
        [
          ["name", "Name"],
          ["phone", "Phone"],
          ["address", "Address"],
        ],
      ],

      suppliers: [
        "Supplier",
        [
          ["name", "Name"],
          ["phone", "Phone"],
          ["address", "Address"],
        ],
      ],

      employees: [
        "Employee",
        [
          ["name", "Name"],
          ["phone", "Phone"],
          ["role", "Role"],
          ["salary", "Salary", "$"],
        ],
      ],

      warehouses: [
        "Warehouse",
        [
          ["name", "Name"],
          ["location", "Location"],
        ],
      ],

      expenses: [
        "Expense",
        [
          ["date", "Date", "d"],
          ["title", "Title"],
          ["amount", "Amount", "$"],
        ],
      ],

      salary: [
        "Salary Slip",
        [
          ["employee", "Employee", "employees"],
          ["month", "Month"],
          ["amount", "Amount", "$"],
          ["date", "Date", "d"],
        ],
      ],

      transfers: [
        "Transfer",
        [
          ["product", "Product", "products"],
          ["from", "From", "warehouses"],
          ["to", "To", "warehouses"],
          ["qty", "Qty", "n"],
          ["date", "Date", "d"],
        ],
      ],
    };

    const cell = (v: any, t: string) =>
      t === "$"
        ? tk(v)
        : D[t]
          ? esc(nm(t, v))
          : esc(v);

    const empty = (n: number) =>
      `<tr><td colspan="${n}" class="mut">No data yet</td></tr>`;

    const opts = (a: any[], sel?: any) =>
      a
        .map(
          (x) =>
            `<option value="${x.id}" ${
              x.id == sel ? "selected" : ""
            }>${esc(x.name)}</option>`,
        )
        .join("");

    const flt = (el: HTMLInputElement) => {
      const q = el.value.toLowerCase();

      el.closest(".card")
        ?.querySelectorAll("tbody tr")
        .forEach((r) => {
          (r as HTMLElement).hidden = !r.textContent
            ?.toLowerCase()
            .includes(q);
        });
    };

    const tab = (
      t: string,
      h: string[],
      rows: any[][],
      top = "",
    ) =>
      `<div class="card">
        <div class="hd">
          <h2>${t}</h2>
          ${top}
        </div>

        <input
          class="srch"
          placeholder="Search..."
          oninput="flt(this)"
        >

        <div class="wrap">
          <table>
            <thead>
              <tr>
                ${["SL."]
                  .concat(h)
                  .map((x) => `<th>${x}</th>`)
                  .join("")}
              </tr>
            </thead>

            <tbody>
              ${
                rows.length
                  ? rows
                      .map(
                        (r, i) =>
                          `<tr>
                            <td>${i + 1}</td>
                            ${r
                              .map((c) => `<td>${c}</td>`)
                              .join("")}
                          </tr>`,
                      )
                      .join("")
                  : empty(h.length + 1)
              }
            </tbody>
          </table>
        </div>
      </div>`;

    const list = (k: string) => {
      const [t, cols] = C[k];
      const top = k === "products"
        ? `<a class="btn pu product-list-link" href="#product-add">+ Add new Product</a>`
        : `<button class="btn pu" type="button" id="addRecordButton">+ Add new ${t}</button>`;
      $("#app").innerHTML = tab(
        t + " List",
        cols.map((c: any[]) => c[1]).concat("Action"),
        D[k].map((r: any) => cols
          .map((c: any[]) => cell(r[c[0]], c[2]))
          .concat(`<button class="mini" onclick="del('${k}',${r.id})">Delete</button>`)),
        top,
      );
      if (k !== "products") {
        $("#addRecordButton")?.addEventListener("click", () => form(k));
      }
    };
    const form = (k: string) => {
      const [t, cols] = C[k];

      $("#dlg").innerHTML = `
        <h3>Add new ${t}</h3>

        ${cols
          .filter((c: any[]) => c[0] !== "status")
          .map((c: any[]) => {
            const y = c[2] || "t";

            return `
              <label>${c[1]}</label>

              ${
                D[y]
                  ? `<select id="f_${c[0]}">
                      ${opts(D[y])}
                    </select>`
                  : `
                    <input
                      id="f_${c[0]}"
                      type="${
                        y === "d"
                          ? "date"
                          : y === "$" || y === "n"
                            ? "number"
                            : "text"
                      }"
                      ${
                        y === "d"
                          ? `value="${today()}"`
                          : ""
                      }
                      min="0"
                    >
                  `
              }
            `;
          })
          .join("")}

        <div class="two" style="margin-top:16px">
          <button
            class="btn or"
            type="button"
            id="cancelRecordButton"
          >
            Cancel
          </button>

          <button
            class="btn pu"
            type="button"
            id="saveRecordButton"
          >
            Save
          </button>
        </div>
      `;

      $("#dlg").showModal();
      $("#cancelRecordButton")?.addEventListener("click", () => $("#dlg").close());
      $("#saveRecordButton")?.addEventListener("click", () => add(k));
    };

    const add = (k: string) => {
      const r: AnyData = {
        id: uid(),
        status: "Active",
      };

      for (const c of C[k][1]) {
        if (c[0] === "status") continue;

        const el = $(`#f_${c[0]}`);

        if (!el) continue;

        const v = el.value.trim();
        const y = c[2];

        if (v === "") {
          toast("Fill in all fields");
          return;
        }

        r[c[0]] =
          D[y] || y === "$" || y === "n"
            ? D[y]
              ? +v
              : +v
            : v;
      }

      D[k].push(r);

      save();

      $("#dlg").close();

      render();

      toast(k === "expenses" && D.settings.notifications.expenses ? "Expense added" : C[k][0] + " saved");
    };

    const del = (k: string, id: number) => {
      if (confirm("Delete this record?")) {
        const record = D[k].find((x: any) => x.id === id);
        const productImagePath = k === "products" ? (record?.imagePath || record?.image) : "";
        if (record?.items && !record.ret) {
          record.items.forEach((item: any) => {
            const product = prod(item.id);
            if (!product) return;
            if (k === "sales") product.stock += +item.qty || 0;
            if (k === "purchases") product.stock -= +item.qty || 0;
          });
        }
        D[k] = D[k].filter((x: any) => x.id !== id);

        if (productImagePath) void removeProductImage(productImagePath).catch((error) => console.warn("Could not delete product image", error));

        save();

        render();
      }
    };

    const ret = (k: string, id: number) => {
      const s = D[k].find((x: any) => x.id == id);

      if (!s) return;

      s.ret = 1;

      s.items?.forEach((i: any) => {
        const p = prod(i.id);

        if (p) {
          p.stock += k === "sales" ? i.qty : -i.qty;
        }
      });

      D[k === "sales" ? "sr" : "pr"].unshift({
        inv: s.inv,
        date: today(),
        name: s.party,
        total: s.total,
        paid: s.paid,
      });

      save();

      render();

      toast("Return recorded");
    };

    const showActionMenu = (event: MouseEvent, id: number) => {
      event.stopPropagation();
      const trigger = event.currentTarget as HTMLElement;
      const menu = document.getElementById(`sale-actions-${id}`) as any;
      if (!menu) return;
      if (menu.matches(":popover-open")) {
        menu.hidePopover();
        return;
      }
      menu.showPopover();
      const rect = trigger.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - 150, window.innerWidth - 158));
      const top = rect.bottom + menu.offsetHeight < window.innerHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - menu.offsetHeight - 4);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };

    const editSale = (id: number) => {
      const sale = D.sales.find((item: any) => item.id == id);
      if (!sale) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `
        <h3>Edit Invoice ${esc(sale.inv)}</h3>
        <label>Date</label><input id="editSaleDate" type="date" value="${esc(sale.date)}">
        <label>Party Name</label><input id="editSaleParty" value="${esc(sale.party)}">
        <label>Discount (৳)</label><input id="editSaleDiscount" type="number" min="0" step="0.01" value="${+sale.disc || 0}">
        <label>Paid Amount (৳)</label><input id="editSalePaid" type="number" min="0" step="0.01" value="${+sale.paid || 0}">
        <label>Payment Type</label><select id="editSalePayment">${["Cash", "bKash", "Nagad", "Card"].map((type) => `<option ${sale.pay === type ? "selected" : ""}>${type}</option>`).join("")}</select>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="saveSaleEdit">Save Changes</button>
        </div>`;
      dialog.showModal();
      $("#saveSaleEdit")?.addEventListener("click", () => {
        const subtotal = sale.subtotal ?? sum(sale.items || [], (item: any) => (item.price ?? prod(item.id)?.sell ?? 0) * item.qty);
        const discount = Math.max(0, +$("#editSaleDiscount").value || 0);
        const total = Math.max(0, subtotal + (+sale.vat || 0) + (+sale.shipping || 0) - discount);
        const paid = Math.min(total, Math.max(0, +$("#editSalePaid").value || 0));
        sale.date = $("#editSaleDate").value || sale.date;
        sale.party = $("#editSaleParty").value.trim() || sale.party;
        sale.disc = discount;
        sale.total = total;
        sale.paid = paid;
        sale.due = Math.max(0, total - paid);
        sale.pay = $("#editSalePayment").value;
        sale.p = sum(sale.items || [], (item: any) => ((item.price ?? prod(item.id)?.sell ?? 0) - (prod(item.id)?.buy || 0)) * item.qty) - discount;
        save();
        dialog.close();
        render();
        toast("Invoice updated");
      });
    };

    let CART: any[] = [];

    let PT = "sale";
    let PRODUCT_CATEGORY = "";
    let PRODUCT_BRAND = "";

    const pos = (t: string) => {
      PT = t;

      CART = [];

      const s = t === "sale";

      $("#app").innerHTML = `
        <div class="pos">

          <div class="card">

            <div class="hd">
              <h3>Quick Action</h3>

              <a
                href="#dashboard"
                class="mini"
                style="text-decoration:none;color:inherit"
              >
                Dashboard
              </a>
            </div>

            <div class="two">
              <input
                id="pd"
                type="date"
                value="${today()}"
              >

              <input
                id="pn"
                readonly
                value="${
                  s ? "S-" : "P-"
                }${String(D.seq).padStart(5, "0")}"
              >
            </div>

            <div class="two">
              <select id="pp">
                <option value="">
                  ${
                    s
                      ? "Walk-in Customer"
                      : "Select Supplier"
                  }
                </option>

                ${opts(
                  s
                    ? D.customers.filter((customer: any) => customer.name?.toLowerCase() !== "walk-in customer")
                    : D.suppliers,
                )}
              </select>

              <select id="pw">
                ${opts(D.warehouses)}
              </select>
            </div>

            ${s ? `
              <div class="two walkin-fields" id="walkinFields">
                <input id="walkName" type="text" placeholder="Walk-in customer name">
                <input id="walkPhone" type="tel" inputmode="tel" placeholder="Walk-in phone number">
              </div>
            ` : ""}

            ${s ? `<div class="serial-scan"><label for="serialScan">Scan a barcode, or enter a product code or serial number, then press Enter</label><input id="serialScan" autocomplete="off" placeholder="Barcode, product code or serial number"></div>` : ""}

            <div class="wrap">
              <table style="min-width:560px">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Serial No.</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Sub Total</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody id="ct"></tbody>
              </table>
            </div>

            <div
              class="two"
              style="margin-top:14px"
            >

              <div>

                <label>
                  ${s ? "Receive" : "Paid"} Amount
                </label>

                <input
                  id="rc"
                  type="number"
                  min="0"
                  value="0"
                  oninput="calc()"
                >

                <label>
                  Change Amount
                </label>

                <input
                  id="ch"
                  readonly
                  value="0"
                >

                <label>
                  Due Amount
                </label>

                <input
                  id="du"
                  readonly
                  value="0"
                >

                <label>
                  Payment Type
                </label>

                <select id="py">
                  <option>Cash</option>
                  <option>bKash</option>
                  <option>Nagad</option>
                  <option>Card</option>
                </select>

              </div>

              <div class="sum">

                <div>
                  Sub Total
                  <b id="sb">0.00৳</b>
                </div>

                <div>
                  Vat (%)

                  <input
                    id="vt"
                    type="number"
                    min="0"
                    value="${+D.settings.taxRate || 0}"
                    oninput="calc()"
                  >
                </div>

                <div>
                  Discount (৳)

                  <input
                    id="dc"
                    type="number"
                    min="0"
                    value="0"
                    oninput="calc()"
                  >
                </div>

                ${
                  s
                    ? `
                      <div>
                        Shipping

                        <input
                          id="sh"
                          type="number"
                          min="0"
                          value="0"
                          oninput="calc()"
                        >
                      </div>
                    `
                    : ""
                }

                <div>
                  <b>Total Amount</b>
                  <b id="tt">0.00৳</b>
                </div>

              </div>

            </div>

            <div class="two">

              <button
                class="btn or"
                onclick="pos(PT)"
              >
                Cancel
              </button>

              <button
                class="btn rd"
                onclick="savePos()"
              >
                Save
              </button>

            </div>

          </div>

          <div class="card">

            <div class="pos-product-toolbar">
              <input id="productSearch" placeholder="Search product..." oninput="pgrid(this.value)">
              <button class="product-search-button" type="button" aria-label="Search products" onclick="pgrid(document.getElementById('productSearch').value)"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>
              <select class="product-category-filter" id="productCategoryFilter" aria-label="Filter by category" onchange="setProductFilters()"><option value="">Category</option>${opts(D.categories)}</select>
              <select class="product-brand-filter" id="productBrandFilter" aria-label="Filter by brand" onchange="setProductFilters()"><option value="">Brand</option>${opts(D.brands)}</select>
            </div>

            <div
              class="pg"
              id="pg"
            ></div>

          </div>

        </div>
      `;

      if (s) {
        const partySelect = $("#pp");
        const walkinFields = $("#walkinFields");
        const syncWalkinFields = () => {
          if (walkinFields) walkinFields.hidden = Boolean(partySelect?.value);
        };
        partySelect?.addEventListener("change", syncWalkinFields);
        syncWalkinFields();
        const serialScan = $("#serialScan");
        serialScan?.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const value = serialScan.value.trim();
          if (!value) return;
          addSerialFromScan(value);
        });
      }

      pgrid("");

      draw();
    };

    const pgrid = (q: string) => {
      const isSale = PT === "sale";
      const search = q.toLowerCase();
      const products = D.products.filter((p: any) =>
        (p.name + p.code).toLowerCase().includes(search) &&
        (!PRODUCT_CATEGORY || String(p.category) === PRODUCT_CATEGORY) &&
        (!PRODUCT_BRAND || String(p.brand) === PRODUCT_BRAND),
      );

      $("#pg").innerHTML = products.map((p: any) => `
        <button class="pos-product-card" onclick="addc(${p.id})">
          ${typeof p.image === "string" && p.image
            ? `<img class="pos-product-image" src="${esc(p.image)}" alt="${esc(p.name)}">`
            : `<div class="pos-product-placeholder">No image</div>`}
          <span class="pos-product-info">
            <b>${esc(p.name)}</b>
            <small>${esc(p.code || "")}</small>
            <strong>${tk(isSale ? p.sell : p.buy)}</strong>
            <span class="pos-product-quantity">Quantity: <em>${+p.stock || 0}</em></span>
          </span>
        </button>`).join("") || "<div class='mut'>No product found</div>";
    };

    const setProductFilters = () => {
      PRODUCT_CATEGORY = $("#productCategoryFilter")?.value || "";
      PRODUCT_BRAND = $("#productBrandFilter")?.value || "";
      pgrid($("#productSearch")?.value || "");
    };
    const addc = (id: number, enteredSerial?: string) => {
      const p = prod(id);

      if (!p) return;

      let serial = "";
      if (PT === "sale" && p.hasSerial) {
        if (+p.stock <= 0) {
          toast("This product is out of stock");
          return;
        }
        const entered = enteredSerial ?? window.prompt(`Enter serial number for ${p.name}`);
        if (entered === null) return;
        serial = entered.trim();
        if (!serial) {
          toast("Serial number is required");
          return;
        }
        const availableSerial = (p.serials || []).find((value: string) => value.toLowerCase() === serial.toLowerCase());
        if (!availableSerial) {
          toast("Serial not in product stock. Add it in Product Edit first.");
          return;
        }
        serial = availableSerial;
        const isDuplicate = (items: any[]) => items.some((item: any) =>
          (item.serials || []).some((value: string) => value.toLowerCase() === serial.toLowerCase()),
        );
        if (D.sales.some((sale: any) => isDuplicate(sale.items || [])) || isDuplicate(CART)) {
          toast("This serial number has already been sold or added");
          return;
        }
      }

      const c = CART.find((x) => x.id === id);

      if (c) {
        c.qty++;
        if (serial) c.serials.push(serial);
      } else {
        CART.push({
          id,
          qty: 1,
          price: PT === "sale" ? p.sell : p.buy,
          serials: serial ? [serial] : [],
        });
      }

      draw();
    };

    const addSerialFromScan = (serial: string) => {
      const matchedProduct = D.products.find((p: any) =>
        p.hasSerial && +p.stock > 0 &&
        (p.serials || []).some((value: string) => value.toLowerCase() === serial.toLowerCase()),
      );
      if (matchedProduct) {
        addc(matchedProduct.id, serial);
      } else {
        const codeMatch = D.products.find((p: any) =>
          !p.hasSerial && +p.stock > 0 && String(p.code || "").trim().toLowerCase() === serial.toLowerCase(),
        );
        if (!codeMatch) {
          toast("Serial not found. For regular products, enter the product code.");
          return;
        }
        addc(codeMatch.id);
      }
      const input = $("#serialScan");
      if (input) {
        input.value = "";
        input.focus();
      }
    };

    const setCartPrice = (index: number, value: string) => {
      if (!CART[index]) return;
      CART[index].price = +value || 0;
      calc();
    };

    const setCartQty = (index: number, value: string) => {
      const item = CART[index];
      if (!item) return;
      item.qty = prod(item.id)?.hasSerial && PT === "sale"
        ? item.serials.length
        : Math.max(1, +value || 1);
      calc();
    };

    const removeCartItem = (index: number) => {
      if (index < 0 || index >= CART.length) return;
      CART.splice(index, 1);
      draw();
    };

    const draw = () => {
      $("#ct").innerHTML =
        CART.map(
          (c, i) => `
            <tr>

              <td>
                ${esc(prod(c.id)?.name)}
              </td>

              <td>${c.serials?.length ? c.serials.map((value: string) => esc(value)).join(", ") : "-"}</td>

              <td>
                <input
                  type="number"
                  style="width:80px"
                  value="${c.price}"
                  oninput="setCartPrice(${i},this.value)"
                >
              </td>

              <td>
                <input
                  type="number"
                  min="1"
                  style="width:64px"
                  value="${c.qty}"
                  ${PT === "sale" && prod(c.id)?.hasSerial ? "readonly title=\"Add one unit by selecting the product and entering its serial number\"" : ""}
                  oninput="setCartQty(${i},this.value)"
                >
              </td>

              <td id="st${i}"></td>

              <td>
                <button
                  class="mini"
                  onclick="removeCartItem(${i})"
                >
                  ✕
                </button>
              </td>

            </tr>
          `,
        ).join("") || empty(6);

      calc();
    };

    const calc = () => {
      const g = (id: string) =>
        +($("#" + id)?.value || 0);

      const s = sum(
        CART,
        (c) => c.price * c.qty,
      );

      const vat = (s * g("vt")) / 100;
      const shipping = g("sh");
      const tot = Math.max(0, s + vat - g("dc") + shipping);

      const rc = g("rc");

      CART.forEach((c, i) => {
        const e = $("#st" + i);

        if (e) {
          e.textContent = tk(
            c.price * c.qty,
          );
        }
      });

      if ($("#sb")) {
        $("#sb").textContent = tk(s);
      }

      if ($("#tt")) {
        $("#tt").textContent = tk(tot);
      }

      if ($("#ch")) {
        $("#ch").value = Math.max(
          rc - tot,
          0,
        ).toFixed(2);
      }

      if ($("#du")) {
        $("#du").value = Math.max(
          tot - rc,
          0,
        ).toFixed(2);
      }

      return {
        tot,
        rc,
        dc: g("dc"),
        subtotal: s,
        vat,
        shipping,
        due: Math.max(tot - rc, 0),
      };
    };

 const savePos = ()    => {
      if (!CART.length) {
        toast("Add at least one product");
        return;
      }

      const s = PT === "sale";

      const T = calc();

      if (
        s &&
        CART.some(
          (c) =>
            c.qty >
            (prod(c.id)?.stock || 0),
        )
      ) {
        toast("Not enough stock");
        return;
      }

      if (s && CART.some((c) => prod(c.id)?.hasSerial && (c.serials?.length || 0) !== c.qty)) {
        toast("Enter a serial number for each serialized unit");
        return;
      }

      CART.forEach((c) => {
        const pr = prod(c.id);

        if (!pr) return;

        if (s) {
          pr.stock -= c.qty;
          if (pr.hasSerial && c.serials?.length) {
            const soldSerials = new Set(c.serials.map((value: string) => value.toLowerCase()));
            pr.serials = (pr.serials || []).filter((value: string) => !soldSerials.has(value.toLowerCase()));
          }
        } else {
          pr.stock += c.qty;
          pr.buy = c.price;
        }
      });

      const pid = $("#pp").value;

      // The number shown on the form may have been used since it opened, by this
      // device or another one, so move on to the next one that is free.
      const usedNumbers = new Set(D[s ? "sales" : "purchases"].map((entry: any) => entry.inv));
      let invoiceNumber = $("#pn").value;
      while (usedNumbers.has(invoiceNumber)) {
        D.seq++;
        invoiceNumber = `${s ? "S-" : "P-"}${String(D.seq).padStart(5, "0")}`;
      }

      D[s ? "sales" : "purchases"].unshift({
        id: uid(),

        inv: invoiceNumber,

        date: $("#pd").value,

        party: pid
          ? nm(
              s
                ? "customers"
                : "suppliers",
              pid,
            )
          : (s ? $("#walkName")?.value.trim() : "") || "Walk-in Customer",

        phone: pid
          ? (D[s ? "customers" : "suppliers"].find((person: any) => person.id == pid)?.phone || "")
          : (s ? $("#walkPhone")?.value.trim() : "") || "",

        total: T.tot,

        subtotal: T.subtotal,

        vat: T.vat,

        shipping: T.shipping,

        disc: T.dc,

        paid: Math.min(
          T.rc,
          T.tot,
        ),

        due: T.due,

        pay: $("#py").value,

        items: CART.map((c) => ({
          id: c.id,
          qty: c.qty,
          price: c.price,
          name: prod(c.id)?.name || "Product",
          serials: c.serials || [],
        })),

        p: sum(
          CART,
          (c) =>
            (c.price -
              (prod(c.id)?.buy || 0)) *
            c.qty,
        ) - T.dc,
      });

      save();

      const lowStockItem = s && CART.find((item) => {
        const product = prod(item.id);
        return product && isLowStock(product);
      });
      const notice = s
        ? lowStockItem && D.settings.notifications.lowStock
          ? `Low stock: ${lowStockItem ? prod(lowStockItem.id)?.name : "product"}`
          : T.due > 0 && D.settings.notifications.dueReminders
            ? "Sale saved with a due balance"
            : D.settings.notifications.sales ? "Sale saved" : "Saved"
        : D.settings.notifications.purchases ? "Purchase saved" : "Saved";
      toast(notice);
      if (s) quickReceipt(D.sales[0].id);

      location.hash = s
        ? "sales"
        : "purchases";
    };

    const tabInner = (
      h: string[],
      r: any[][],
    ) =>
      `<div class="wrap">
        <table>
          <thead>
            <tr>
              ${h
                .map(
                  (x) =>
                    `<th>${x}</th>`,
                )
                .join("")}
            </tr>
          </thead>

          <tbody>
            ${
              r.length
                ? r
                    .map(
                      (x) =>
                        `<tr>
                          ${x
                            .map(
                              (c) =>
                                `<td>${c}</td>`,
                            )
                            .join("")}
                        </tr>`,
                    )
                    .join("")
                : empty(h.length)
            }
          </tbody>
        </table>
      </div>`;

    const rtab = (
      b: HTMLElement,
      w: string,
    ) => {
      document
        .querySelectorAll(".tabs button")
        .forEach((x) =>
          x.classList.remove("on"),
        );

      b.classList.add("on");

      const a =
        w === "s"
          ? D.sales
          : D.purchases;

      $("#rt").innerHTML = tabInner(
        [
          "Date",
          "Invoice",
          "Customer",
          "Total",
          "Paid",
          "Due",
        ],
        a.slice(0, 5).map(
          (s: any) => [
            s.date,
            s.inv,
            esc(s.party),
            tk(s.total),
            tk(s.paid),
            tk(s.due),
          ],
        ),
      );
    };

    // One rule for every picture chosen in the app (product, replacement, profile):
    // an oversized or non-image file is refused the moment it is picked.
    const MAX_IMAGE_FILE_KB = 200;
    root.addEventListener("change", (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.type !== "file" || !input.accept.startsWith("image/")) return;
      const file = input.files?.[0];
      if (!file) return;
      const problem = !file.type.startsWith("image/")
        ? "Choose an image file (JPG, PNG or WebP)."
        : file.size > MAX_IMAGE_FILE_KB * 1024
          ? `This image is ${file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}. Choose one smaller than ${MAX_IMAGE_FILE_KB} KB.`
          : "";
      // Shown beside the field too, because a toast can sit behind an open dialog.
      const note = input.nextElementSibling?.classList.contains("image-limit-note")
        ? input.nextElementSibling as HTMLElement
        : document.createElement("small");
      note.className = "image-limit-note";
      note.style.cssText = "display:block;margin-top:4px;color:#d92d20;font-size:12px";
      note.textContent = problem;
      if (!problem) { note.remove(); return; }
      input.after(note);
      input.value = "";
      event.stopImmediatePropagation();
      toast(problem);
    }, true);

    const optimizeProductImage = async (file: Blob) => {
      const bitmap = await createImageBitmap(file);
      let scale = Math.min(1, 280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Could not process the selected image");
      }
      let image = "";
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const quality = Math.max(0.38, 0.72 - attempt * 0.07);
        image = canvas.toDataURL("image/jpeg", quality);
        const approximateBytes = (image.length - image.indexOf(",") - 1) * 0.75;
        if (approximateBytes <= 28 * 1024) break;
        scale *= 0.78;
      }
      bitmap.close();
      return image;
    };

    const productForm = () => {
      const textField = (id: string, label: string, hint: string, type = "text", required = false) =>
        `<label class="product-field"><span>${label}</span><input id="p_${id}" type="${type}" placeholder="${hint}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="0.01"' : ""}></label>`;
      const selectField = (id: string, label: string, data: any[]) =>
        `<label class="product-field"><span>${label}</span><select id="p_${id}" required><option value="">Select one</option>${opts(data)}</select></label>`;

      $("#app").innerHTML = `
        <section class="card product-create">
          <div class="hd">
            <h2>Add New Product</h2>
            <a class="btn pu product-list-link" href="#products">☷ Product List</a>
          </div>
          <form id="productCreateForm">
            <div class="product-fields">
              ${textField("name", "Product Name", "Enter Product Name", "text", true)}
              ${selectField("warehouse", "WareHouse", D.warehouses)}
              ${selectField("category", "Product Category", D.categories)}
              ${selectField("brand", "Product Brand", D.brands)}
              ${selectField("unit", "Product Unit", D.units)}
              ${textField("code", "Product Code", "Enter Product Code", "text", true)}
              ${textField("stock", "Stock", "Enter stock qty", "number", true)}
              ${textField("lowAlert", "Low Stock Alert", "EX: 5", "number")}
              ${textField("buy", "Purchase Price", "Enter purchase price", "number", true)}
              ${textField("mrp", "MRP Price", "Enter MRP price", "number", true)}
              ${textField("wholesale", "Wholesale Price", "Enter wholesale price", "number")}
              ${textField("dealer", "Dealer Price", "Enter dealer price", "number")}
              ${textField("manufacturer", "Manufacturer", "Enter manufacturer name")}
              ${textField("manufactureDate", "Manufacture Date", "", "date")}
              ${textField("expireDate", "Expire Date", "", "date")}
              <label class="product-field"><span>Image (max ${MAX_IMAGE_FILE_KB} KB)</span><input id="p_image" type="file" accept="image/*"><img id="productImagePreview" class="product-image-preview" alt="Product image preview"></label>
              <label class="product-field"><span>Has Serial</span><select id="p_hasSerial"><option>No</option><option>Yes</option></select></label>
              <label class="product-field serial-inventory-field" id="serialInventoryField" hidden><span>Available Serial Numbers</span><textarea id="p_serials" class="product-serial-input" placeholder="Enter one serial number per line, or separate with commas"></textarea></label>
            </div>
            <div class="product-create-actions">
              <button class="btn or" type="reset">Reset</button>
              <button class="btn pu" type="submit">Save</button>
            </div>
          </form>
        </section>`;

      const serialField = $("#serialInventoryField");
      const syncSerialField = () => { serialField.hidden = $("#p_hasSerial").value !== "Yes"; };
      $("#p_hasSerial")?.addEventListener("change", syncSerialField);
      syncSerialField();

      $("#p_image")?.addEventListener("change", (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        const preview = $("#productImagePreview") as HTMLImageElement;
        if (!file || !preview) return;
        if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
        const objectUrl = URL.createObjectURL(file);
        preview.dataset.objectUrl = objectUrl;
        preview.src = objectUrl;
        preview.style.display = "block";
      });

      $("#productCreateForm")?.addEventListener("submit", async (event: Event) => {
        event.preventDefault();
        const value = (id: string) => $("#p_" + id)?.value?.trim() || "";
        const imageFile = $("#p_image")?.files?.[0] as File | undefined;
        let image = "";
        if (imageFile) {
          try {
            image = await optimizeProductImage(imageFile);
          } catch {
            toast("Could not load this image");
            return;
          }
        }
        const productId = uid();
        let imagePath = "";
        if (image) {
          try {
            const uploadedImage = await uploadProductImage(productId, image);
            image = uploadedImage.image;
            imagePath = uploadedImage.imagePath;
          } catch (error) {
            console.error("Could not upload product image", error);
            imagePath = "";
            toast("Image upload failed; the compressed image will stay with this product record.");
          }
        }
        const product: AnyData = {
          id: productId,
          name: value("name"),
          code: value("code"),
          warehouse: +value("warehouse"),
          category: +value("category"),
          brand: +value("brand"),
          unit: +value("unit"),
          stock: +value("stock"),
          lowAlert: +value("lowAlert") || 0,
          buy: +value("buy"),
          sell: +value("mrp"),
          mrp: +value("mrp"),
          wholesale: +value("wholesale") || 0,
          dealer: +value("dealer") || 0,
          manufacturer: value("manufacturer"),
          manufactureDate: value("manufactureDate"),
          expireDate: value("expireDate"),
          image,
          imagePath,
          hasSerial: value("hasSerial") === "Yes",
          serials: value("hasSerial") === "Yes"
            ? [...new Set(value("serials").split(/[\n,;]+/).map((serial: string) => serial.trim()).filter(Boolean))]
            : [],
        };
        D.products.push(product);
        save();
        toast("Product saved");
        location.hash = "products";
      });
    };

    // The printer connected for printing straight to it (labels and receipts), kept while moving between screens.
    let PRINTER_LINK: PrinterLink | null = null;

    const openInvoice = (id: number, compact = false, autoPrint = false) => {
      const sale = D.sales.find((item: any) => item.id == id);
      if (!sale) {
        toast("Invoice not found");
        return;
      }

      const invoiceWindow = window.open("", "_blank", "width=820,height=900");
      if (!invoiceWindow) {
        toast("Allow pop-ups to open the invoice");
        return;
      }

      const items = (sale.items || []).map((item: any) => {
        const product = prod(item.id);
        const price = +(item.price ?? product?.sell ?? 0);
        return {
          name: esc(item.name || product?.name || "Product"),
          qty: +item.qty || 0,
          price,
          total: price * (+item.qty || 0),
          serials: item.serials || [],
        };
      });
      const subtotal = +(sale.subtotal ?? sum(items, (item) => item.total));
      const discount = +sale.disc || 0;
      const vat = +sale.vat || 0;
      const shipping = +sale.shipping || 0;
      const total = +sale.total || 0;
      const paid = +sale.paid || 0;
      const due = +(sale.due ?? Math.max(total - paid, 0));
      const shopName = esc(D.user.shop || "My Shop");
      // The receipt opens in its own window, so the logo needs its full address.
      const shopLogo = D.user.logo ? `<img src="${esc(new URL(D.user.logo, window.location.href).href)}" alt="" style="max-height:${compact ? "48px" : "80px"};max-width:100%;margin-bottom:6px">` : "";

      invoiceWindow.document.write(`
        <!doctype html>
        <html><head><meta charset="utf-8"><title>Invoice ${esc(sale.inv)}</title>
        <style>
          @page{size:${compact ? "58mm auto" : "A4"};margin:${compact ? "0" : "14mm"}}
          *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font:14px/1.45 Arial,sans-serif}
          .toolbar{display:flex;justify-content:center;gap:10px;padding:18px}
          .toolbar button{border:0;border-radius:4px;padding:9px 16px;background:#07851b;color:#fff;font-weight:700;cursor:pointer}
          .paper{width:${compact ? "58mm" : "min(100%,760px)"};margin:0 auto 24px;padding:${compact ? "4mm" : "34px"};background:#fff;border:1px solid #d1d5db}
          .center{text-align:center}.brand{font-size:${compact ? "19px" : "26px"};font-weight:800}.sub{color:#4b5563}.rule{border-top:1px dashed #64748b;margin:10px 0}
          .row{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.meta{margin-top:12px}
          table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:6px 2px;border-bottom:1px solid #e5e7eb;font-size:${compact ? "11px" : "13px"}}th:last-child,td:last-child{text-align:right}
          .amounts{max-width:340px;margin-left:auto}.grand{font-size:17px;font-weight:800}.thank{margin-top:18px;font-weight:700}
          @media print{body{background:#fff}.toolbar{display:none}.paper{width:${compact ? "58mm" : "100%"};margin:0;border:0;padding:${compact ? "4mm" : "0"}}}
        </style></head><body>
        <div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.print()">Save PDF</button></div>
        <main class="paper">
          <header class="center">${shopLogo}<div class="brand">${shopName}</div><div class="sub">${esc(D.user.phone || "")}</div><div class="sub">${esc(D.user.address || "")}</div><div class="sub">Money Receipt</div></header>
          <div class="rule"></div>
          <div class="row"><span>Invoice</span><b>${esc(sale.inv)}</b></div>
          <div class="row"><span>Date</span><span>${esc(sale.date)}</span></div>
          <div class="row"><span>Customer</span><span>${esc(sale.party || "Walk-in Customer")}</span></div>
          ${sale.phone ? `<div class="row"><span>Mobile</span><span>${esc(sale.phone)}</span></div>` : ""}
          <div class="row"><span>Payment</span><span>${esc(sale.pay || "Cash")}</span></div>
          <div class="rule"></div>
          <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>${items.map((item: AnyData) => `<tr><td>${item.name}${item.serials.length ? `<br><small>Serial: ${item.serials.map((value: string) => esc(value)).join(", ")}</small>` : ""}</td><td>${item.qty}</td><td>${tk(item.price)}</td><td>${tk(item.total)}</td></tr>`).join("") || `<tr><td colspan="4">No item details</td></tr>`}</tbody>
          </table>
          <section class="amounts">
            <div class="row"><span>Subtotal</span><span>${tk(subtotal)}</span></div>
            <div class="row"><span>VAT</span><span>${tk(vat)}</span></div>
            <div class="row"><span>Shipping</span><span>${tk(shipping)}</span></div>
            <div class="row"><span>Discount</span><span>${tk(discount)}</span></div>
            <div class="rule"></div>
            <div class="row grand"><span>Total Amount</span><span>${tk(total)}</span></div>
            <div class="row"><span>Paid Amount</span><span>${tk(paid)}</span></div>
            <div class="row"><span>Due</span><span>${tk(due)}</span></div>
          </section>
          <div class="rule"></div><div class="center thank">${esc(D.settings.invoiceFooter || "Thank you for your purchase!")}</div>
        </main>
        ${autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>` : ""}
        </body></html>`);
      invoiceWindow.document.close();
    };

    // ---- Receipts straight to a receipt printer, or shared as a picture.
    // A phone has no print window worth using, and an iPhone's browser is not
    // allowed to reach a Bluetooth printer at all, so there are three ways out:
    // print on a connected printer, share the receipt as a picture (which a
    // printer's own app can print), or the print window as before.
    const RECEIPT_SAVED = "hishabpos_receipt";
    const RECEIPT_OPTIONS = { kind: "escpos" as "escpos" | "tspl", paper: 58 as 58 | 80 };
    try {
      Object.assign(RECEIPT_OPTIONS, JSON.parse(localStorage.getItem(RECEIPT_SAVED) || "{}"));
    } catch {
      // Nothing usable was saved; the defaults above apply.
    }
    // The receipt is a picture, so its words are not reached by the page's translation and are put through it here.
    const said = (text: string) => (currentLanguage() === "bn" ? translate(text) : text);
    const receiptFor = (sale: any): Receipt => {
      const items = (sale.items || []).map((item: any) => {
        const product = prod(item.id);
        const price = +(item.price ?? product?.sell ?? 0);
        const qty = +item.qty || 0;
        return { name: String(item.name || product?.name || said("Product")), qty, price: tk(price), total: tk(price * qty), amount: price * qty, note: item.serials?.length ? `${said("Serial")}: ${item.serials.join(", ")}` : "" };
      });
      const total = +sale.total || 0;
      const paid = +sale.paid || 0;
      const extra = (label: string, amount: number) => (amount ? [{ label: said(label), value: tk(amount) }] : []);
      return {
        shop: String(D.user.shop || "My Shop"),
        header: [D.user.phone, D.user.address, said("Money Receipt")].filter(Boolean).map(String),
        details: [
          [said("Invoice"), String(sale.inv || "")],
          [said("Date"), String(sale.date || "")],
          [said("Customer"), String(sale.party || said("Walk-in Customer"))],
          ...(sale.phone ? [[said("Mobile"), String(sale.phone)] as [string, string]] : []),
          [said("Payment"), said(String(sale.pay || "Cash"))],
        ],
        items,
        totals: [
          { label: said("Subtotal"), value: tk(+(sale.subtotal ?? sum(items, (item: any) => item.amount))) },
          ...extra("VAT", +sale.vat || 0),
          ...extra("Shipping", +sale.shipping || 0),
          ...extra("Discount", +sale.disc || 0),
          { label: said("Total Amount"), value: tk(total), strong: true },
          { label: said("Paid Amount"), value: tk(paid) },
          { label: said("Due"), value: tk(+(sale.due ?? Math.max(total - paid, 0))) },
        ],
        footer: String(D.settings.invoiceFooter || "Thank you for your purchase!"),
      };
    };
    const receiptPicture = (sale: any) => drawReceipt(receiptFor(sale), PAPER_DOTS[RECEIPT_OPTIONS.paper] || PAPER_DOTS[58]);
    // Resolves to whether the receipt reached the printer.
    const sendReceipt = async (sale: any): Promise<boolean> => {
      if (!PRINTER_LINK) return false;
      try {
        const picture = receiptPicture(sale);
        await PRINTER_LINK.send(RECEIPT_OPTIONS.kind === "tspl" ? tsplReceiptJob(picture) : escposJob(picture));
        toast("Receipt sent to the printer");
        return true;
      } catch (error) {
        console.error("Could not print the receipt directly", error);
        PRINTER_LINK = null;
        toast("The printer stopped answering. Connect it again.");
        return false;
      }
    };
    const receiptDialog = (id: number) => {
      const sale = D.sales.find((item: any) => item.id == id);
      if (!sale) { toast("Invoice not found"); return; }
      try { localStorage.setItem(RECEIPT_SAVED, JSON.stringify(RECEIPT_OPTIONS)); } catch { /* the choice then lasts only for this visit */ }
      const dialog = $("#dlg") as HTMLDialogElement;
      const quiet = `style="background:var(--bg);color:var(--tx);border:1px solid var(--ln)"`;
      const canConnect = canUseBluetooth() || canUseSerial();
      const pick = (name: string, choices: [string | number, string][], chosen: string | number) => `<select id="${name}" style="width:auto">${choices.map(([value, text]) => `<option value="${value}" ${value === chosen ? "selected" : ""}>${text}</option>`).join("")}</select>`;
      dialog.innerHTML = `<h3>Receipt</h3>
        <div id="rcPreview" style="max-height:44vh;overflow:auto;padding:8px;border:1px solid var(--ln);border-radius:6px;background:#fff;text-align:center"></div>
        <p id="rcState" style="margin:12px 0 8px;font-weight:600">${PRINTER_LINK ? `Connected: ${esc(PRINTER_LINK.name)}` : "Not connected"}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${PRINTER_LINK
            ? `<button class="btn pu" id="rcPrint" type="button">Print receipt</button><button class="btn" id="rcDisconnect" type="button" ${quiet}>Disconnect</button>`
            : `${canUseBluetooth() ? `<button class="btn pu" id="rcBluetooth" type="button">Connect by Bluetooth</button>` : ""}${canUseSerial() ? `<button class="btn" id="rcSerial" type="button" ${quiet}>Connect by cable (COM port)</button>` : ""}`}
          <button class="btn ${canConnect ? "" : "pu"}" id="rcShare" type="button" ${canConnect ? quiet : ""}>Share or save picture</button>
          <button class="btn" id="rcWindow" type="button" ${quiet}>Open print window</button>
          <button class="btn" id="rcClose" type="button" ${quiet}>Close</button>
        </div>
        ${canUseBluetooth() ? "" : `<p class="settings-help" style="margin:10px 0 0">This browser cannot reach a Bluetooth printer. On an iPhone, Safari and Chrome are not allowed to: open this site in the Bluefy browser app to print straight to the printer. Or press "Share or save picture" and print the picture from your printer's app.</p>`}
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:12px">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0">Printer ${pick("rcKind", [["escpos", "Receipt printer"], ["tspl", "Label printer"]], RECEIPT_OPTIONS.kind)}</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0">Paper ${pick("rcPaper", [[58, "58 mm"], [80, "80 mm"]], RECEIPT_OPTIONS.paper)}</label>
        </div>`;
      const canvas = pictureCanvas(receiptPicture(sale));
      canvas.style.cssText = "max-width:100%;width:260px;height:auto;image-rendering:pixelated";
      $("#rcPreview").append(canvas);
      // Made ready now, because sharing has to start in the very moment of the tap.
      let picture: File | null = null;
      canvas.toBlob((blob) => { if (blob) picture = new File([blob], `receipt-${String(sale.inv || id).replace(/[^\w-]+/g, "_")}.png`, { type: "image/png" }); }, "image/png");
      if (!dialog.open) dialog.showModal();

      const connect = async (open: () => Promise<PrinterLink>) => {
        try {
          PRINTER_LINK = await open();
          toast("Printer connected");
        } catch (error) {
          if ((error as Error)?.name !== "NotFoundError") toast(error instanceof Error ? error.message : "The printer could not be connected.");
        }
        receiptDialog(id);
      };
      $("#rcBluetooth")?.addEventListener("click", () => void connect(connectBluetooth));
      $("#rcSerial")?.addEventListener("click", () => void connect(connectSerial));
      $("#rcDisconnect")?.addEventListener("click", () => { void PRINTER_LINK?.close().catch(() => undefined); PRINTER_LINK = null; receiptDialog(id); });
      $("#rcPrint")?.addEventListener("click", async () => {
        const state = $("#rcState");
        if (state) state.textContent = "Printing…";
        if (await sendReceipt(sale)) dialog.close();
        else receiptDialog(id);
      });
      $("#rcShare").addEventListener("click", () => {
        if (!picture) { toast("The picture is still being made. Try again."); return; }
        if (navigator.canShare?.({ files: [picture] })) {
          void navigator.share({ files: [picture], title: picture.name }).catch(() => undefined);
          return;
        }
        // No sharing here (most computers): save the picture instead.
        const link = document.createElement("a");
        link.href = URL.createObjectURL(picture);
        link.download = picture.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      });
      $("#rcWindow").addEventListener("click", () => { dialog.close(); openInvoice(id, true, true); });
      $("#rcClose").addEventListener("click", () => dialog.close());
      $("#rcKind").addEventListener("change", () => { RECEIPT_OPTIONS.kind = $("#rcKind").value === "tspl" ? "tspl" : "escpos"; receiptDialog(id); });
      $("#rcPaper").addEventListener("change", () => { RECEIPT_OPTIONS.paper = +$("#rcPaper").value === 80 ? 80 : 58; receiptDialog(id); });
    };
    // After a sale: print at once when a printer is connected, otherwise offer the ways to print.
    const quickReceipt = (id: number) => {
      const sale = D.sales.find((item: any) => item.id == id);
      if (sale && PRINTER_LINK) void sendReceipt(sale);
      else receiptDialog(id);
    };

    let PRODUCT_LIST_QUERY = "";
    let PRODUCT_LIST_LIMIT = 10;
    let PRODUCT_LIST_PAGE = 1;

    const filteredProducts = () => D.products.filter((product: any) => {
      const query = PRODUCT_LIST_QUERY.toLowerCase();
      return `${product.name || ""} ${product.code || ""} ${nm("brands", product.brand)} ${nm("categories", product.category)}`
        .toLowerCase().includes(query);
    });

    const productList = () => {
      const matching = filteredProducts();
      const pages = Math.max(1, Math.ceil(matching.length / PRODUCT_LIST_LIMIT));
      PRODUCT_LIST_PAGE = Math.min(PRODUCT_LIST_PAGE, pages);
      const visible = matching.slice((PRODUCT_LIST_PAGE - 1) * PRODUCT_LIST_LIMIT, PRODUCT_LIST_PAGE * PRODUCT_LIST_LIMIT);
      const rows = visible.map((product: any, index: number) => `
        <tr>
          <td>${(PRODUCT_LIST_PAGE - 1) * PRODUCT_LIST_LIMIT + index + 1}</td>
          <td>${typeof product.image === "string" && product.image
            ? `<img class="product-thumb" src="${esc(product.image)}" alt="${esc(product.name)}">`
            : `<span class="product-thumb-empty">No image</span>`}</td>
          <td>${esc(product.name)}</td><td>${esc(product.code)}</td>
          <td>${esc(nm("brands", product.brand))}</td><td>${esc(nm("categories", product.category))}</td>
          <td>${esc(nm("units", product.unit))}</td><td>${tk(product.buy)}</td><td>${tk(product.sell)}</td>
          <td>${+product.stock || 0}</td><td>${product.hasSerial ? "Yes" : "No"}</td>
          <td><div class="action-cell"><button class="action-trigger" aria-label="Product actions" onclick="showProductMenu(event,${product.id})"><span class="more-dots" aria-hidden="true"><i></i><i></i><i></i></span></button>
            <div class="action-menu" id="product-actions-${product.id}" popover>
              <button onclick="this.closest('[popover]').hidePopover();editProduct(${product.id})">Edit</button>
              <button onclick="this.closest('[popover]').hidePopover();del('products',${product.id})">Delete</button>
            </div></div></td>
        </tr>`).join("") || `<tr><td class="mut" colspan="12">No products found</td></tr>`;

      $("#app").innerHTML = `
        <section class="card product-list-page">
          <div class="hd"><h2>Product List</h2><a class="btn pu product-list-link product-add-control" href="#product-add">＋ Add new Product</a></div>
          <div class="product-list-toolbar">
            <select id="productPageSize" aria-label="Rows per page">
              <option value="10" ${PRODUCT_LIST_LIMIT === 10 ? "selected" : ""}>Show- 10</option>
              <option value="25" ${PRODUCT_LIST_LIMIT === 25 ? "selected" : ""}>Show- 25</option>
              <option value="50" ${PRODUCT_LIST_LIMIT === 50 ? "selected" : ""}>Show- 50</option>
              <option value="100" ${PRODUCT_LIST_LIMIT === 100 ? "selected" : ""}>Show- 100</option>
            </select>
            <input id="productListSearch" value="${esc(PRODUCT_LIST_QUERY)}" placeholder="Search..." aria-label="Search products">
            <div class="product-export-actions">
              <button class="excel" title="Export Excel-compatible CSV" aria-label="Export Excel-compatible CSV" onclick="exportProducts()"><svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h8M8 19h8"/><path d="m2 8 4 8m0-8-4 8"/></svg></button>
              <button class="pdf" title="Save PDF" aria-label="Save PDF" onclick="printProducts()"><svg viewBox="0 0 24 24"><path d="M6 2h9l4 4v16H6zM14 2v5h5M8 13h8M8 17h8"/></svg></button>
              <button class="print" title="Print" aria-label="Print" onclick="printProducts()"><svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7zM17 11h.01"/></svg></button>
            </div>
          </div>
          <div class="wrap"><table class="product-table"><thead><tr><th>SL.</th><th>Image</th><th>Product Name</th><th>Code</th><th>Brand</th><th>Category</th><th>Unit</th><th>Purchase Price</th><th>Sale Price</th><th>Stock</th><th>Serial</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="product-page-footer"><span>Showing ${matching.length ? (PRODUCT_LIST_PAGE - 1) * PRODUCT_LIST_LIMIT + 1 : 0} to ${Math.min(PRODUCT_LIST_PAGE * PRODUCT_LIST_LIMIT, matching.length)} of ${matching.length} products</span><div><button id="productPrev" ${PRODUCT_LIST_PAGE <= 1 ? "disabled" : ""}>Previous</button> <button id="productNext" ${PRODUCT_LIST_PAGE >= pages ? "disabled" : ""}>Next</button></div></div>
        </section>`;

      $("#productListSearch")?.addEventListener("input", (event: Event) => {
        PRODUCT_LIST_QUERY = (event.currentTarget as HTMLInputElement).value;
        PRODUCT_LIST_PAGE = 1;
        productList();
        const input = $("#productListSearch");
        input?.focus();
        if (input) input.setSelectionRange(PRODUCT_LIST_QUERY.length, PRODUCT_LIST_QUERY.length);
      });
      $("#productPageSize")?.addEventListener("change", (event: Event) => {
        PRODUCT_LIST_LIMIT = +(event.currentTarget as HTMLSelectElement).value;
        PRODUCT_LIST_PAGE = 1;
        productList();
      });
      $("#productPrev")?.addEventListener("click", () => { PRODUCT_LIST_PAGE--; productList(); });
      $("#productNext")?.addEventListener("click", () => { PRODUCT_LIST_PAGE++; productList(); });
    };

    const showProductMenu = (event: MouseEvent, id: number) => {
      event.stopPropagation();
      const trigger = event.currentTarget as HTMLElement;
      const menu = document.getElementById(`product-actions-${id}`) as any;
      if (!menu) return;
      if (menu.matches(":popover-open")) { menu.hidePopover(); return; }
      menu.showPopover();
      const rect = trigger.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.right - 150, window.innerWidth - 158))}px`;
      menu.style.top = `${rect.bottom + menu.offsetHeight < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menu.offsetHeight - 4)}px`;
    };

    const editProduct = (id: number) => {
      const product = prod(id);
      if (!product) return;
      const dialog = $("#dlg");
      dialog.innerHTML = `
        <h3>Edit Product</h3>
        <label>Product Name</label><input id="ep_name" value="${esc(product.name)}">
        <label>Product Code</label><input id="ep_code" value="${esc(product.code)}">
        <label>Brand</label><select id="ep_brand">${opts(D.brands, product.brand)}</select>
        <label>Category</label><select id="ep_category">${opts(D.categories, product.category)}</select>
        <label>Unit</label><select id="ep_unit">${opts(D.units, product.unit)}</select>
        <div class="two"><div><label>Purchase Price</label><input id="ep_buy" type="number" min="0" step="0.01" value="${+product.buy || 0}"></div><div><label>Sale Price</label><input id="ep_sell" type="number" min="0" step="0.01" value="${+product.sell || 0}"></div></div>
        <div class="two"><div><label>Stock</label><input id="ep_stock" type="number" min="0" step="1" value="${+product.stock || 0}"></div><div><label>Low Stock Alert</label><input id="ep_lowAlert" type="number" min="0" step="1" placeholder="EX: 5" value="${+product.lowAlert || ""}"></div><div><label>Serial</label><select id="ep_serial"><option value="false" ${product.hasSerial ? "" : "selected"}>No</option><option value="true" ${product.hasSerial ? "selected" : ""}>Yes</option></select></div></div>
        <label id="editSerialInventoryField">Available Serial Numbers<textarea id="ep_serials" class="product-serial-input" placeholder="Enter one serial number per line, or separate with commas">${esc((product.serials || []).join("\n"))}</textarea></label>
        <label>Replace Image (optional, max ${MAX_IMAGE_FILE_KB} KB)</label><input id="ep_image" type="file" accept="image/*">
        <div class="two" style="margin-top:16px"><button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button><button class="btn pu" type="button" id="saveProductEdit">Save Changes</button></div>`;
      dialog.showModal();
      const syncEditSerialField = () => { $("#editSerialInventoryField").hidden = $("#ep_serial").value !== "true"; };
      $("#ep_serial")?.addEventListener("change", syncEditSerialField);
      syncEditSerialField();
      $("#saveProductEdit")?.addEventListener("click", async () => {
        const imageFile = $("#ep_image")?.files?.[0] as File | undefined;
        let image = product.image || "";
        let imagePath = product.imagePath || "";
        if (imageFile) {
          try {
            const optimizedImage = await optimizeProductImage(imageFile);
            const uploadedImage = await uploadProductImage(product.id, optimizedImage);
            void removeProductImage(imagePath || image).catch((error) => console.warn("Could not delete replaced product image", error));
            image = uploadedImage.image;
            imagePath = uploadedImage.imagePath;
          } catch (error) {
            console.error("Could not upload replacement product image", error);
            image = await optimizeProductImage(imageFile).catch(() => product.image || "");
            imagePath = "";
            toast("Image upload failed; the compressed image will stay with this product record.");
          }
        }
        Object.assign(product, {
          name: $("#ep_name").value.trim(), code: $("#ep_code").value.trim(),
          brand: +$("#ep_brand").value, category: +$("#ep_category").value, unit: +$("#ep_unit").value,
          buy: Math.max(0, +$("#ep_buy").value || 0), sell: Math.max(0, +$("#ep_sell").value || 0),
          stock: Math.max(0, +$("#ep_stock").value || 0), lowAlert: Math.max(0, +$("#ep_lowAlert").value || 0), hasSerial: $("#ep_serial").value === "true",
          serials: $("#ep_serial").value === "true"
            ? [...new Set(String($("#ep_serials").value).split(/[\n,;]+/).map((serial: string) => serial.trim()).filter(Boolean))]
            : [], image, imagePath,
        });
        save(); dialog.close(); render(); toast("Product updated");
      });
    };

    const exportProducts = () => {
      const csv = [["SL", "Image", "Product Name", "Code", "Brand", "Category", "Unit", "Purchase Price", "Sale Price", "Stock", "Serial"],
        ...filteredProducts().map((p: any, i: number) => [i + 1, p.image ? "Image attached" : "", p.name, p.code, nm("brands", p.brand), nm("categories", p.category), nm("units", p.unit), p.buy, p.sell, p.stock, p.hasSerial ? "Yes" : "No"])]
        .map((row) => row.map((value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const link = document.createElement("a");
      const fileUrl = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
      link.href = fileUrl;
      link.download = "product-list.csv"; link.click(); window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    };

    const printProducts = () => window.print();

    const currencyPage = () => {
      const rows = D.currencies.map((currency: any, index: number) => `<tr><td>${index + 1}</td><td>${esc(currency.name)}</td><td>${esc(currency.code)}</td><td>${esc(currency.symbol)}</td><td>${+currency.rate || 1}</td><td>${esc(currency.status || "Active")}</td><td><button class="mini edit-currency" data-id="${currency.id}">Edit</button><button class="mini delete-currency" data-id="${currency.id}">Delete</button></td></tr>`).join("");
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>Currencies</h2><button class="btn pu" id="addCurrency">+ Add Currency</button></div><div class="wrap"><table><thead><tr><th>SL.</th><th>Name</th><th>Code</th><th>Symbol</th><th>Exchange Rate</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || empty(7)}</tbody></table></div></section>`;
      $("#addCurrency")?.addEventListener("click", () => currencyForm());
      document.querySelectorAll(".edit-currency").forEach((button) => button.addEventListener("click", () => currencyForm(+(button as HTMLElement).dataset.id!)));
      document.querySelectorAll(".delete-currency").forEach((button) => button.addEventListener("click", () => {
        const id = +(button as HTMLElement).dataset.id!;
        if (id == D.settings.currencyId) { toast("Choose another default currency before deleting this one"); return; }
        if (confirm("Delete this currency?")) { D.currencies = D.currencies.filter((currency: any) => currency.id !== id); save(); currencyPage(); }
      }));
    };

    const currencyForm = (id?: number) => {
      const currency = id ? D.currencies.find((entry: any) => entry.id === id) : null;
      $("#dlg").innerHTML = `<h3>${currency ? "Edit" : "Add"} Currency</h3><label>Name</label><input id="currencyName" value="${esc(currency?.name || "")}" placeholder="Currency name"><label>Code</label><input id="currencyCode" value="${esc(currency?.code || "")}" placeholder="BDT"><label>Symbol</label><input id="currencySymbol" value="${esc(currency?.symbol || "")}" placeholder="৳"><label>Exchange Rate</label><input id="currencyRate" type="number" min="0.000001" step="0.000001" value="${currency?.rate || 1}"><label>Status</label><select id="currencyStatus"><option ${currency?.status !== "Inactive" ? "selected" : ""}>Active</option><option ${currency?.status === "Inactive" ? "selected" : ""}>Inactive</option></select><div class="two" style="margin-top:16px"><button class="btn or" id="cancelCurrency" type="button">Cancel</button><button class="btn pu" id="saveCurrency" type="button">Save</button></div>`;
      $("#dlg").showModal();
      $("#cancelCurrency").addEventListener("click", () => $("#dlg").close());
      $("#saveCurrency").addEventListener("click", () => {
        const name = $("#currencyName").value.trim();
        const code = $("#currencyCode").value.trim().toUpperCase();
        const symbol = $("#currencySymbol").value.trim();
        const rate = +$("#currencyRate").value;
        if (!name || !code || !symbol || !(rate > 0)) { toast("Enter a name, code, symbol, and positive exchange rate"); return; }
        const data = { name, code, symbol, rate, status: $("#currencyStatus").value };
        if (currency) Object.assign(currency, data);
        else D.currencies.push({ id: uid(), ...data });
        if ((currency?.id || D.currencies[D.currencies.length - 1].id) == D.settings.currencyId) CURRENCY_SYMBOL = symbol;
        save(); $("#dlg").close(); currencyPage(); toast("Currency saved");
      });
    };

    const notificationsPage = () => {
      const options: [string, string][] = [["lowStock", "Low stock alerts"], ["dueReminders", "Customer due reminders"], ["sales", "New sale notifications"], ["purchases", "New purchase notifications"], ["expenses", "Expense notifications"]];
      $("#app").innerHTML = `<section class="card settings-card"><h2>Notifications</h2><p class="settings-help">Choose which in-app alerts you want to enable.</p><form id="notificationForm">${options.map(([key, label]) => `<label class="setting-toggle"><span>${label}</span><input type="checkbox" name="${key}" ${D.settings.notifications[key] ? "checked" : ""}></label>`).join("")}<button class="btn pu" type="submit">Save Changes</button></form></section>`;
      $("#notificationForm").addEventListener("submit", (event: Event) => {
        event.preventDefault();
        D.settings.notifications = Object.fromEntries(options.map(([key]) => [key, ($(`#notificationForm [name="${key}"]`) as HTMLInputElement).checked]));
        save(); toast("Notification settings saved");
      });
    };

    const generalSettingsPage = () => {
      $("#app").innerHTML = `<section class="card settings-card"><h2>General Settings</h2><p class="settings-help">Shop information and defaults used in sales and receipts.</p><form id="generalSettingsForm"><div class="settings-form-grid"><label>Shop Name<input id="settingShop" value="${esc(D.user.shop || "")}" required></label><label>Shop Logo (max ${MAX_IMAGE_FILE_KB} KB)<input id="settingLogo" type="file" accept="image/*">${D.user.logo ? `<span style="display:flex;align-items:center;gap:10px;margin-top:8px"><img src="${esc(D.user.logo)}" alt="Current logo" style="height:44px;border-radius:6px"><label style="display:flex;align-items:center;gap:6px;font-weight:400"><input id="settingLogoRemove" type="checkbox" style="width:auto"> Remove logo</label></span>` : ""}</label><label>Email<input id="settingEmail" type="email" value="${esc(D.user.shopEmail || "")}"></label><label>Phone<input id="settingPhone" type="tel" value="${esc(D.user.phone || "")}"></label><label>Address<input id="settingAddress" value="${esc(D.user.address || "")}"></label><label>Default Currency<select id="settingCurrency">${opts(D.currencies, D.settings.currencyId)}</select></label><label>Current User Role${!isWorkspaceOwner ? `<input value="${esc(D.roles.find((entry: any) => entry.id == (isWorkspaceOwner ? D.user.roleId : activeRoleId))?.name || "Assigned role")}" disabled>` : `<select id="settingRole">${opts(D.roles, D.user.roleId)}</select>`}</label><label>Default VAT (%)<input id="settingTax" type="number" min="0" step="0.01" value="${+D.settings.taxRate || 0}"></label><label class="settings-wide">Invoice Footer<input id="settingFooter" value="${esc(D.settings.invoiceFooter || "Thank you for your purchase!")}"></label></div><button class="btn pu" type="submit">Save Changes</button></form></section>`;
      $("#generalSettingsForm").addEventListener("submit", async (event: Event) => {
        event.preventDefault();
        const logoFile = $("#settingLogo")?.files?.[0] as File | undefined;
        let logo = D.user.logo || "";
        if (logoFile) {
          try {
            const uploaded = await hostingApi.uploadImage(await optimizeProductImage(logoFile));
            void removeProductImage(logo).catch((error) => console.warn("Could not delete the old logo", error));
            logo = uploaded.url;
          } catch (error) {
            console.error("Could not upload the shop logo", error);
            toast("The logo could not be uploaded. Try again.");
            return;
          }
        } else if ($("#settingLogoRemove")?.checked) {
          void removeProductImage(logo).catch((error) => console.warn("Could not delete the old logo", error));
          logo = "";
        }
        D.user = { ...D.user, logo, roleId: !isWorkspaceOwner ? D.user.roleId : +$("#settingRole").value, shop: $("#settingShop").value.trim(), shopEmail: $("#settingEmail").value.trim(), phone: $("#settingPhone").value.trim(), address: $("#settingAddress").value.trim() };
        D.settings.currencyId = +$("#settingCurrency").value;
        D.settings.taxRate = Math.max(0, +$("#settingTax").value || 0);
        D.settings.invoiceFooter = $("#settingFooter").value.trim();
        CURRENCY_SYMBOL = D.currencies.find((currency: any) => currency.id == D.settings.currencyId)?.symbol || String.fromCharCode(2547);
        save(); hdr(); render(); toast("General settings saved");
      });
    };

    const ROLE_PERMISSIONS = ["Dashboard", "Sales", "Purchases", "Products", "Stock List", "Employee", "Salary Slip", "Warehouse", "Customers", "Suppliers", "Expenses", "Due List", "Profit & Loss List", "Profile", "Settings"];
    const rolesPage = () => {
      const rows = D.roles.map((role: any, index: number) => `<tr><td>${index + 1}</td><td>${esc(role.name)}</td><td>${esc((role.permissions || []).join(", "))}</td><td><button class="mini edit-role" data-id="${role.id}">Edit</button><button class="mini delete-role" data-id="${role.id}">Delete</button></td></tr>`).join("");
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>User Roles</h2><button class="btn pu" id="addRole">+ Add Role</button></div><div class="wrap"><table><thead><tr><th>SL.</th><th>Role</th><th>Permissions</th><th>Action</th></tr></thead><tbody>${rows || empty(4)}</tbody></table></div></section>`;
      $("#addRole").addEventListener("click", () => roleForm());
      document.querySelectorAll(".edit-role").forEach((button) => button.addEventListener("click", () => roleForm(+(button as HTMLElement).dataset.id!)));
      document.querySelectorAll(".delete-role").forEach((button) => button.addEventListener("click", () => {
        const id = +(button as HTMLElement).dataset.id!;
        const role = D.roles.find((entry: any) => entry.id === id);
        if (role?.name === "Admin") { toast("The Admin role cannot be deleted"); return; }
        if (confirm("Delete this role?")) { D.roles = D.roles.filter((entry: any) => entry.id !== id); save(); rolesPage(); }
      }));
    };

    const roleForm = (id?: number) => {
      const role = id ? D.roles.find((entry: any) => entry.id === id) : null;
      const permissions = role?.permissions || [];
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.classList.add("role-form");
      dialog.addEventListener("close", () => dialog.classList.remove("role-form"), { once: true });
      dialog.innerHTML = `<div class="role-form-content"><h2 class="role-form-title">${role ? "Edit User Role" : "Add User Role"}</h2><p class="role-form-help">${role ? "Update this role’s access to workspace sections." : "Create a login account and choose the sections it can access."}</p>${role ? "" : `<div class="role-fields"><label class="role-field"><span>User Title</span><input id="memberName" autocomplete="name" placeholder="e.g. Sales Executive" required></label><label class="role-field"><span>Email Address</span><input id="memberEmail" type="email" autocomplete="email" placeholder="name@example.com" required></label><label class="role-field"><span>Password</span><input id="memberPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required></label><label class="role-field"><span>Confirm Password</span><input id="memberConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter password" required></label></div>`}<label class="role-field" style="margin-bottom:20px"><span>Role Name</span><input id="roleName" value="${esc(role?.name || "")}" placeholder="e.g. Sales Team" required></label><div class="role-section-title"><span>Permissions</span><label class="role-select-all"><input id="roleSelectAll" type="checkbox"> Select all</label></div><div class="role-permissions">${ROLE_PERMISSIONS.map((permission) => `<label><input type="checkbox" value="${permission}" ${permissions.includes("All permissions") || permissions.includes(permission) ? "checked" : ""}>${permission}</label>`).join("")}</div><div id="roleFormStatus" class="role-form-status" role="status" aria-live="polite"></div><div class="role-actions"><button class="btn" style="background:var(--bg);color:var(--tx);border:1px solid var(--ln)" id="cancelRole" type="button">Cancel</button><button class="btn pu" id="saveRole" type="button">${role ? "Save Changes" : "Create Account"}</button></div></div>`;
      const allBox = $("#roleSelectAll") as HTMLInputElement;
      const permissionBoxes = [...dialog.querySelectorAll<HTMLInputElement>(".role-permissions input")];
      allBox.checked = permissionBoxes.length > 0 && permissionBoxes.every((box) => box.checked);
      allBox.addEventListener("change", () => permissionBoxes.forEach((box) => { box.checked = allBox.checked; }));
      permissionBoxes.forEach((box) => box.addEventListener("change", () => { allBox.checked = permissionBoxes.every((item) => item.checked); }));
      dialog.showModal();
      $("#cancelRole").addEventListener("click", () => $("#dlg").close());
      $("#saveRole").addEventListener("click", async () => {
        const status = $("#roleFormStatus");
        const showRoleError = (message: string) => {
          status.textContent = message;
          status.classList.add("visible");
          status.scrollIntoView({ block: "nearest" });
        };
        status.textContent = "";
        status.classList.remove("visible");
        const name = $("#roleName").value.trim();
        if (!name) { showRoleError("Enter a role name."); $("#roleName").focus(); return; }
        const selected = [...dialog.querySelectorAll<HTMLInputElement>(".role-permissions input:checked")].map((input) => input.value);
        if (!selected.length) { showRoleError("Choose at least one permission for this account."); return; }
        const saveButton = $("#saveRole") as HTMLButtonElement;
        saveButton.disabled = true;
        try {
          if (role) {
            Object.assign(role, { name, permissions: selected });
            save(); dialog.close(); rolesPage(); toast("Role saved");
            return;
          }
          const memberName = $("#memberName").value.trim();
          const memberEmail = $("#memberEmail").value.trim().toLowerCase();
          const password = $("#memberPassword").value;
          const confirmPassword = $("#memberConfirm").value;
          if (!memberName || !memberEmail || !password || !confirmPassword) { showRoleError("Fill in the title, email, password, and password confirmation."); return; }
          if (password.length < 8) { showRoleError("Password must contain at least 8 characters."); $("#memberPassword").focus(); return; }
          if (password !== confirmPassword) { showRoleError("Passwords do not match."); $("#memberConfirm").focus(); return; }

          const roleId = uid();
          const newRole = { id: roleId, name, permissions: selected };
          await hostingApi.createMember(memberName, memberEmail, password, roleId);
          D.roles.push(newRole);
          save();
          dialog.close(); rolesPage(); toast("Login account created with this role");
        } catch (error) {
          showRoleError(error instanceof Error ? error.message : "Could not create the login account. Try again.");
        } finally {
          saveButton.disabled = false;
        }
      });
    };

    // ---- Barcode labels: choose products and how many labels of each, then print.
    // A label carries the product's code, which the Sale screen accepts from a scanner.
    // `on` is the tick on the row: only ticked products are printed by the button at the top.
    let BARCODE_ITEMS: { id: any; qty: number; on: boolean }[] = [];
    // Sizes are in millimetres, as printed. They are remembered on this device,
    // because they belong to the label paper and printer in use here.
    const BARCODE_SAVED = "hishabpos_barcode_v2";
    const BARCODE_PRESETS: [number, number][] = [[50, 25], [50, 30], [40, 30], [40, 25], [38, 25], [30, 20], [60, 40], [58, 40], [80, 50], [100, 50]];
    const BARCODE_OPTIONS = {
      shop: true, name: true, code: true, price: true,
      paper: "roll" as "roll" | "a4",
      // Which way up the printed page is. On a roll, landscape is the label as designed.
      orient: "portrait" as "landscape" | "portrait",
      // How far the print is turned on a roll, in degrees clockwise.
      turn: 0 as 0 | 90 | 180 | 270,
      // Whether the page size is sent to a label printer. Off by default: a printer that
      // cannot take so small a custom size prints a blank page, while its own paper setting always works.
      sendSize: false,
      // For printing straight to the printer: whether the roll is one long strip rather than separate labels.
      continuous: false,
      across: 1, width: 50, height: 25, bars: 9, font: 7, gap: 2, dpi: 203, offsetX: 0, offsetY: 0,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(BARCODE_SAVED) || "{}");
      // Settings saved before the print could be turned four ways: "portrait" on a roll meant a quarter turn.
      if (saved.turn === undefined && saved.paper !== "a4") {
        if (saved.orient === "portrait") saved.turn = 90;
        delete saved.orient;
      }
      Object.assign(BARCODE_OPTIONS, saved);
    } catch {
      // Nothing usable was saved; the defaults above apply.
    }
    const BARCODE_LIMITS = { across: [1, 10], width: [15, 200], height: [10, 200], bars: [3, 80], font: [5, 16], gap: [0, 20], offsetX: [-30, 80], offsetY: [-30, 80] } as const;
    const BARCODE_SIDE = 1.5; // blank strip kept at each side of a label, in mm
    const BARCODE_STYLE = `.bc-grid{display:grid;grid-template-columns:repeat(var(--bc-across),var(--bc-width));gap:var(--bc-gap);justify-content:start}.bc-row{display:flex;gap:var(--bc-gap);width:max-content;margin-bottom:3mm}.bc-turn{overflow:hidden;margin-bottom:3mm}.bc-label{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto;width:var(--bc-width);height:var(--bc-height);padding:0 ${BARCODE_SIDE}mm;outline:1px dashed #94a3b8;outline-offset:-1px;background:#fff;color:#000;text-align:center;font:var(--bc-font)/1.15 Arial,Helvetica,sans-serif;overflow:hidden;break-inside:avoid}.bc-label > div{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-label svg{display:block;flex:0 0 auto;margin:.5mm 0 .3mm}.bc-shop{font-size:calc(var(--bc-font) + 3pt)}.bc-price{font-size:calc(var(--bc-font) + 2pt)}.bc-code{letter-spacing:.2mm}`;
    const barcodeOf = (product: any) => String(product?.code || "").trim();
    const barcodeFit = (product: any) => fitModule(barcodeOf(product), BARCODE_OPTIONS.width - BARCODE_SIDE * 2, BARCODE_OPTIONS.dpi);
    const barcodeVars = () => `--bc-across:${BARCODE_OPTIONS.across};--bc-width:${BARCODE_OPTIONS.width}mm;--bc-height:${BARCODE_OPTIONS.height}mm;--bc-gap:${BARCODE_OPTIONS.gap}mm;--bc-font:${BARCODE_OPTIONS.font}pt`;
    // The labels for the whole list, or for one listed product when `only` is its id.
    const barcodeLabels = (only?: any) => BARCODE_ITEMS.filter((item) => (only === undefined ? item.on : item.id == only)).flatMap(({ id, qty }) => {
      const product = prod(id);
      const fit = product ? barcodeFit(product) : null;
      if (!product || !fit || !fit.moduleMm) return [];
      // Laid out the way shop labels usually are: shop, product, price, then the barcode with its number under it.
      const price = +product.sell || 0;
      const label = `<div class="bc-label">${BARCODE_OPTIONS.shop ? `<div class="bc-shop">${esc(D.user.shop || "")}</div>` : ""}${BARCODE_OPTIONS.name ? `<div class="bc-name">${esc(product.name)}</div>` : ""}${BARCODE_OPTIONS.price ? `<div class="bc-price">Price: ${Number.isInteger(price) ? price : price.toFixed(2)}</div>` : ""}${code128Svg(barcodeOf(product), BARCODE_OPTIONS.bars, fit.moduleMm)}${BARCODE_OPTIONS.code ? `<div class="bc-code">${esc(barcodeOf(product))}</div>` : ""}</div>`;
      return new Array(qty).fill(label);
    });
    // On a roll, each row of labels across the roll is one page; on A4 the labels flow down the sheet.
    // The width of one row of labels, and what an A4 sheet has between its print margins either way up.
    const barcodeRowWidth = () => BARCODE_OPTIONS.across * BARCODE_OPTIONS.width + (BARCODE_OPTIONS.across - 1) * BARCODE_OPTIONS.gap;
    const barcodeSheetWidth = () => (BARCODE_OPTIONS.orient === "landscape" ? 281 : 194);
    const barcodeSheet = (labels: string[]) => {
      if (BARCODE_OPTIONS.paper === "a4") return `<div class="bc-grid" style="${barcodeVars()}">${labels.join("")}</div>`;
      // On a roll the print can be turned in quarter turns, for a printer that feeds
      // the label another way up. The row is drawn as usual inside a box the size it
      // will take up once turned, then turned to fill that box.
      const { turn, height } = BARCODE_OPTIONS;
      const wide = barcodeRowWidth();
      const sideways = turn === 90 || turn === 270;
      const move = { 0: "", 90: `translateX(${height}mm) rotate(90deg)`, 180: `translate(${wide}mm,${height}mm) rotate(180deg)`, 270: `translateY(${wide}mm) rotate(-90deg)` }[turn];
      let rows = "";
      for (let index = 0; index < labels.length; index += BARCODE_OPTIONS.across) {
        const row = labels.slice(index, index + BARCODE_OPTIONS.across).join("");
        rows += move
          ? `<div class="bc-turn" style="width:${sideways ? height : wide}mm;height:${sideways ? wide : height}mm"><div class="bc-row" style="${barcodeVars()};margin:0;transform-origin:top left;transform:${move}">${row}</div></div>`
          : `<div class="bc-row" style="${barcodeVars()}">${row}</div>`;
      }
      return rows;
    };
    const barcodePage = () => {
      BARCODE_ITEMS = BARCODE_ITEMS.filter((item) => prod(item.id));
      try { localStorage.setItem(BARCODE_SAVED, JSON.stringify(BARCODE_OPTIONS)); } catch { /* sizes then last only for this visit */ }
      const options = BARCODE_OPTIONS;
      // The resolution goes with the kind of printer: a label printer has 203 dpi (a few have 300),
      // and an A4 printer is far finer. Bars are sized in whole dots of it, so it has to be right.
      if (options.paper === "a4") options.dpi = 600;
      else if (options.dpi !== 300) options.dpi = 203;
      const printerDots = options.dpi === 300 ? 12 : 8;
      const usable = D.products.filter((product: any) => canEncode(barcodeOf(product)));
      const unusable = D.products.length - usable.length;
      const labels = barcodeLabels();
      const roll = options.paper === "roll";
      const rowWidth = barcodeRowWidth();
      const turned = roll && (options.turn === 90 || options.turn === 270);
      // The paper as the printer sees it.
      const paperSize = turned ? `${options.height} × ${rowWidth}` : `${rowWidth} × ${options.height}`;
      const A4_WIDTH = barcodeSheetWidth();
      // Roughly what the chosen lines and bars need from top to bottom, to warn before paper is wasted.
      // The shop name and the price are printed larger than the other lines.
      const lineMm = (points: number) => points * 0.3528 * 1.15;
      const needed = +options.shop * lineMm(options.font + 3) + +options.name * lineMm(options.font) + +options.price * lineMm(options.font + 2) + +options.code * lineMm(options.font) + options.bars + 1.2;
      const qualityText = { good: "Good", thin: "Thin, may not scan", none: "Does not fit" };
      const rows = BARCODE_ITEMS.map((item, index) => {
        const product = prod(item.id);
        const fit = barcodeFit(product);
        return `<tr><td><input class="bc-pick" data-id="${esc(item.id)}" type="checkbox" style="width:18px;height:18px" aria-label="Print this product" ${item.on ? "checked" : ""}></td><td>${index + 1}</td><td>${esc(product.name)}</td><td>${esc(barcodeOf(product))}</td><td style="color:${fit.quality === "good" ? "var(--gr)" : "var(--rd)"}">${qualityText[fit.quality]}</td><td><span style="display:inline-flex;align-items:center;gap:6px"><button class="mini bc-step" data-id="${esc(item.id)}" data-step="-1" aria-label="One label fewer">−</button><input class="bc-qty" data-id="${esc(item.id)}" type="number" min="1" max="500" step="1" value="${item.qty}" style="width:80px;text-align:center"><button class="mini bc-step" data-id="${esc(item.id)}" data-step="1" aria-label="One label more">+</button></span></td><td><button class="mini bc-print-one" data-id="${esc(item.id)}" ${fit.moduleMm ? "" : "disabled"}>Print</button><button class="mini bc-remove" data-id="${esc(item.id)}">Delete</button></td></tr>`;
      }).join("");
      const problems = BARCODE_ITEMS.map((item) => barcodeFit(prod(item.id)).quality).filter((quality) => quality !== "good");
      const preset = BARCODE_PRESETS.find(([width, height]) => width === options.width && height === options.height);
      const check = (key: "shop" | "name" | "code" | "price", text: string) => `<label style="display:flex;align-items:center;gap:6px;font-weight:400"><input class="bc-option" data-key="${key}" type="checkbox" style="width:auto" ${options[key] ? "checked" : ""}> ${text}</label>`;
      const size = (key: keyof typeof BARCODE_LIMITS, text: string) => `<label>${text}<input class="bc-size" data-key="${key}" type="number" min="${BARCODE_LIMITS[key][0]}" max="${BARCODE_LIMITS[key][1]}" step="${key === "offsetX" || key === "offsetY" || key === "gap" ? "0.5" : "1"}" value="${options[key]}"></label>`;
      const productOptions = (search: string) => `<option value="">Select one</option>${usable.filter((product: any) => `${product.name} ${barcodeOf(product)}`.toLowerCase().includes(search.toLowerCase())).map((product: any) => `<option value="${esc(product.id)}">${esc(product.name)} (${esc(barcodeOf(product))})</option>`).join("")}`;
      const warn = (text: string) => `<p class="settings-help" style="padding:0 18px;color:var(--rd)">${text}</p>`;
      const quiet = `style="background:var(--bg);color:var(--tx);border:1px solid var(--ln)"`;
      // A label printer is printed to directly; that is the way that works without any printer set-up.
      const directBox = `<div style="margin:0 18px 12px;padding:12px 14px;border:2px solid var(--pu);border-radius:8px">
          <p class="settings-help" style="margin:0 0 10px">The label goes straight to the printer, the way a phone label app sends it. Switch the printer on, then connect.</p>
          <p style="margin:0 0 10px;font-weight:600" id="bcLinkState">${PRINTER_LINK ? `Connected: ${esc(PRINTER_LINK.name)}` : "Not connected"}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${PRINTER_LINK
            ? `<button class="btn pu" id="bcDirect" type="button" ${labels.length ? "" : "disabled"}>Print Selected (${labels.length})</button><button class="btn" id="bcDirectTest" type="button" ${quiet}>Print test label</button><button class="btn" id="bcDisconnect" type="button" ${quiet}>Disconnect</button>`
            : `${canUseBluetooth() ? `<button class="btn pu" id="bcBluetooth" type="button">Connect by Bluetooth</button>` : ""}${canUseSerial() ? `<button class="btn" id="bcSerial" type="button" ${quiet}>Connect by cable (COM port)</button>` : ""}${canUseBluetooth() || canUseSerial() ? "" : `<span style="color:var(--rd)">This browser cannot connect to a printer directly. Use Chrome or Edge on a computer.</span>`}`}
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0"><input id="bcContinuous" type="checkbox" style="width:auto" ${options.continuous ? "checked" : ""}> Paper has no gaps between labels</label>
          </div>
        </div>`;
      const windowBox = `<div style="padding:0 18px 12px"><button class="btn pu" id="bcPrint" type="button" ${labels.length ? "" : "disabled"}>Print Selected (${labels.length})</button><p class="settings-help" style="margin:8px 0 0">Opens the print window. Choose A4 paper and print at 100% scale.</p></div>`;
      // The print window is kept for label printers whose own driver is set up for the label.
      const otherWay = `<details style="margin:0 18px 18px;padding:10px 14px;border:1px solid var(--ln);border-radius:8px"><summary style="cursor:pointer;font-weight:600">Other printers: print through the print window</summary>
          <p class="settings-help" style="margin:10px 0">Use this only if the printer cannot be connected above. The printer's own settings in Windows must then have the label size, ${paperSize} mm.</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"><button class="btn" id="bcPrint" type="button" ${quiet} ${labels.length ? "" : "disabled"}>Print Selected (${labels.length})</button><button class="btn" id="bcTest" type="button" ${quiet}>Print test label</button></div>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400"><input id="bcSendSize" type="checkbox" style="width:auto" ${options.sendSize ? "checked" : ""}> Send the label size to the printer</label>
          <p class="settings-help" style="margin:4px 0 0">Leave this off if a print comes out blank. In the print window set Margins to None and Scale to 100.</p>
        </details>`;
      $("#app").innerHTML = `<style>${BARCODE_STYLE}</style><section class="card"><div class="hd"><h2>Print Barcode</h2></div>
        <p class="settings-help" style="padding:0 18px">Each label carries the product's code as a barcode. On the Sale screen, scan a label to add that product to the bill.</p>
        ${unusable ? warn(`${unusable} products are left out because their code is empty or has letters a barcode cannot hold. Give them a code using English letters and digits.`) : ""}
        <h3 style="margin:14px 18px 4px">1. Choose products</h3>
        <div class="settings-form-grid" style="padding:0 18px 12px">
          <label>Search<input id="bcSearch" placeholder="Search product..." autocomplete="off"></label>
          <label>Product<select id="bcProduct">${productOptions("")}</select></label>
          <label>Number of labels<input id="bcQty" type="number" min="1" max="500" step="1" value="1"></label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 14px"><button class="btn pu" id="bcAdd" type="button">Add to list</button><button class="btn" id="bcAddAll" type="button" ${quiet}>Add all products (one label per item in stock)</button>${BARCODE_ITEMS.length ? `<button class="btn" id="bcClear" type="button" ${quiet}>Clear list</button>` : ""}</div>
        ${BARCODE_ITEMS.length > 1 ? `<p class="settings-help" style="padding:0 18px">Tick the products you want to print, then press Print Selected. The Print button on a row prints that product alone.</p>` : ""}
        <div class="wrap"><table><thead><tr><th><input id="bcPickAll" type="checkbox" style="width:18px;height:18px" aria-label="Select all" ${BARCODE_ITEMS.length && BARCODE_ITEMS.every((item) => item.on) ? "checked" : ""} ${BARCODE_ITEMS.length ? "" : "disabled"}></th><th>SL.</th><th>Product</th><th>Code</th><th>Barcode quality</th><th>Number of labels</th><th>Action</th></tr></thead><tbody>${rows || empty(7)}</tbody></table></div>
        ${problems.includes("none") ? warn("A code marked \"Does not fit\" is too long for this label. Use a wider label or a shorter code.") : problems.length ? warn("A barcode marked \"Thin\" has very narrow bars. A wider label or a shorter code makes it scan more reliably.") : ""}
        <h3 style="margin:18px 18px 8px">2. Print</h3>
        ${roll ? directBox : windowBox}
        <h3 style="margin:18px 18px 4px">3. Label</h3>
        <div class="settings-form-grid" style="padding:0 18px 12px">
          <label>Printer<select id="bcPaper"><option value="roll" ${roll ? "selected" : ""}>Label printer (roll)</option><option value="a4" ${roll ? "" : "selected"}>A4 sheet (normal printer)</option></select></label>
          ${roll
            ? `<label>Printer type<select id="bcDpi"><option value="203" ${options.dpi === 300 ? "" : "selected"}>203 dpi (usual)</option><option value="300" ${options.dpi === 300 ? "selected" : ""}>300 dpi</option></select></label>
               <label>Turn the print<select id="bcTurn">${[[0, "0° (as it is)"], [90, "90° (on its side)"], [180, "180° (upside down)"], [270, "270° (on its other side)"]].map(([degrees, text]) => `<option value="${degrees}" ${options.turn === degrees ? "selected" : ""}>${text}</option>`).join("")}</select></label>`
            : `<label>Page direction<select id="bcOrient"><option value="portrait" ${options.orient === "portrait" ? "selected" : ""}>Portrait (tall)</option><option value="landscape" ${options.orient === "landscape" ? "selected" : ""}>Landscape (wide)</option></select></label>`}
          <label>Label size<select id="bcPreset">${BARCODE_PRESETS.map(([width, height]) => `<option value="${width}x${height}" ${preset && preset[0] === width && preset[1] === height ? "selected" : ""}>${width} × ${height} mm</option>`).join("")}<option value="" ${preset ? "" : "selected"}>Custom size</option></select></label>
          ${size("width", "Label width (mm)")}
          ${size("height", "Label height (mm)")}
          ${size("across", roll ? "Labels across the roll" : "Labels per row")}
          ${size("gap", "Gap between labels (mm)")}
          ${size("bars", "Barcode height (mm)")}
          ${size("font", "Text size (pt)")}
          ${size("offsetX", "Move right (mm)")}
          ${size("offsetY", "Move down (mm)")}
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px">${check("shop", "Shop Name")}${check("name", "Product Name")}${check("code", "Code")}${check("price", "Sale Price")}</div>
        </div>
        ${roll ? `<p class="settings-help" style="padding:0 18px">If the print comes out much too big or too small, change the printer type. If it is off to one side, use "Move right" and "Move down" (a minus number moves it left or up).</p>` : rowWidth > A4_WIDTH ? warn(`These labels need ${rowWidth} mm across, but an A4 sheet has ${A4_WIDTH} mm. Use fewer labels per row or a smaller width.`) : ""}
        ${needed > options.height ? warn(`The text and barcode need about ${Math.ceil(needed)} mm but the label is ${options.height} mm high, so part of it will be cut off. Make the barcode or text smaller, or hide a line.`) : ""}
        ${labels.length ? `<div style="padding:6px 18px 18px"><h3 style="margin:0 0 4px">4. Preview</h3><p class="settings-help" style="margin:0 0 10px">Shown at the size it will print. The dashed line is the edge of the label and is not printed.</p><div style="overflow-x:auto;padding:2px" data-no-translate>${barcodeSheet(labels.slice(0, 60))}</div>${labels.length > 60 ? `<p class="settings-help">Showing the first 60 of ${labels.length} labels. All of them are printed.</p>` : ""}</div>` : ""}
        ${roll ? otherWay : ""}
      </section>`;
      const clampQty = (qty: number) => Math.min(500, Math.max(1, Math.floor(qty) || 1));
      const itemFor = (id: any) => BARCODE_ITEMS.find((item) => item.id == id);
      $("#bcSearch").addEventListener("input", () => {
        const select = $("#bcProduct");
        select.innerHTML = productOptions($("#bcSearch").value.trim());
        // One match left: choose it, so typing or scanning a code and pressing Add is enough.
        if (select.options.length === 2) select.selectedIndex = 1;
      });
      $("#bcAdd").addEventListener("click", () => {
        const product = prod($("#bcProduct").value);
        if (!product) { toast("Choose a product first"); return; }
        // Adding a product that is already listed gives it more labels, so labels can be added one at a time.
        const listed = itemFor(product.id);
        const amount = clampQty(+$("#bcQty").value);
        if (listed) Object.assign(listed, { qty: clampQty(listed.qty + amount), on: true });
        else BARCODE_ITEMS.push({ id: product.id, qty: amount, on: true });
        barcodePage();
        $("#bcProduct").value = String(product.id);
      });
      $("#bcAddAll").addEventListener("click", () => {
        usable.forEach((product: any) => {
          const amount = clampQty(+product.stock || 1);
          const listed = itemFor(product.id);
          if (listed) listed.qty = amount;
          else BARCODE_ITEMS.push({ id: product.id, qty: amount, on: true });
        });
        barcodePage();
      });
      $("#bcPickAll").addEventListener("change", () => {
        const on = $("#bcPickAll").checked;
        BARCODE_ITEMS.forEach((item) => { item.on = on; });
        barcodePage();
      });
      document.querySelectorAll(".bc-pick").forEach((box) => box.addEventListener("change", () => {
        const listed = itemFor((box as HTMLElement).dataset.id);
        if (listed) listed.on = (box as HTMLInputElement).checked;
        barcodePage();
      }));
      $("#bcClear")?.addEventListener("click", () => { BARCODE_ITEMS = []; barcodePage(); });
      $("#bcPaper").addEventListener("change", () => {
        options.paper = $("#bcPaper").value === "a4" ? "a4" : "roll";
        // Each kind of printer starts from what suits it; every value can still be changed.
        Object.assign(options, options.paper === "a4" ? { across: 3 } : { across: 1 });
        barcodePage();
      });
      $("#bcOrient")?.addEventListener("change", () => { options.orient = $("#bcOrient").value === "portrait" ? "portrait" : "landscape"; barcodePage(); });
      $("#bcTurn")?.addEventListener("change", () => {
        const degrees = +$("#bcTurn").value;
        options.turn = degrees === 90 || degrees === 180 || degrees === 270 ? degrees : 0;
        barcodePage();
      });
      $("#bcDpi")?.addEventListener("change", () => { options.dpi = +$("#bcDpi").value === 300 ? 300 : 203; barcodePage(); });
      $("#bcPreset").addEventListener("change", () => {
        const [width, height] = $("#bcPreset").value.split("x").map(Number);
        if (width && height) Object.assign(options, { width, height });
        barcodePage();
      });
      document.querySelectorAll(".bc-size").forEach((input) => input.addEventListener("change", () => {
        const key = (input as HTMLElement).dataset.key as keyof typeof BARCODE_LIMITS;
        const [least, most] = BARCODE_LIMITS[key];
        const typed = +(input as HTMLInputElement).value;
        const value = key === "offsetX" || key === "offsetY" || key === "gap" ? Math.round(typed * 2) / 2 : Math.round(typed);
        options[key] = Math.min(most, Math.max(least, Number.isFinite(value) ? value : least));
        barcodePage();
      }));
      document.querySelectorAll(".bc-option").forEach((box) => box.addEventListener("change", () => {
        options[(box as HTMLElement).dataset.key as "shop" | "name" | "code" | "price"] = (box as HTMLInputElement).checked;
        barcodePage();
      }));
      $("#bcSendSize")?.addEventListener("change", () => { options.sendSize = $("#bcSendSize").checked; barcodePage(); });
      document.querySelectorAll(".bc-qty").forEach((input) => input.addEventListener("change", () => {
        const listed = itemFor((input as HTMLElement).dataset.id);
        if (listed) listed.qty = clampQty(+(input as HTMLInputElement).value);
        barcodePage();
      }));
      document.querySelectorAll(".bc-step").forEach((button) => button.addEventListener("click", () => {
        const { id, step } = (button as HTMLElement).dataset;
        const listed = itemFor(id);
        if (listed) listed.qty = clampQty(listed.qty + +step!);
        barcodePage();
      }));
      document.querySelectorAll(".bc-remove").forEach((button) => button.addEventListener("click", () => {
        BARCODE_ITEMS = BARCODE_ITEMS.filter((item) => String(item.id) !== (button as HTMLElement).dataset.id);
        barcodePage();
      }));
      // A label that shows where the print lands: a line right round the edge, the
      // size it is meant to be, and a barcode to try the scanner on. Printing it and
      // looking at the result is how the printer and the label are lined up.
      const testLabel = () => {
        const fit = fitModule("TEST1234", options.width - BARCODE_SIDE * 2, options.dpi);
        return `<div class="bc-label" style="border:0.4mm solid #000"><div class="bc-shop">${options.width} × ${options.height} mm</div>${fit.moduleMm ? code128Svg("TEST1234", Math.min(options.bars, Math.max(3, options.height - 12)), fit.moduleMm) : ""}<div class="bc-code">TEST1234</div></div>`;
      };
      const printLabels = (only?: any, test = false) => {
        const sheet = window.open("", "_blank", "width=900,height=900");
        if (!sheet) { toast("Allow pop-ups to print the labels"); return; }
        // On a roll every row of labels is its own page, exactly the size of the row,
        // and the last one must not ask for a page after it or a blank label comes out.
        const each = options.turn ? ".bc-turn" : ".bc-row";
        const page = roll
          ? `@page{${options.sendSize ? `size:${turned ? `${options.height}mm ${rowWidth}mm` : `${rowWidth}mm ${options.height}mm`};` : ""}margin:0}@media print{${each}{margin:0;break-after:page;page-break-after:always}${each}:last-child{break-after:auto;page-break-after:auto}}`
          : `@page{size:A4 ${options.orient};margin:8mm}`;
        sheet.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode labels</title><style>
          *{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#f3f4f6;font-family:Arial,sans-serif}
          .toolbar{display:flex;justify-content:center;gap:12px;align-items:center;padding:14px;font-size:13px;color:#374151}.toolbar button{border:0;border-radius:4px;padding:9px 22px;background:#07851b;color:#fff;font-weight:700;cursor:pointer}
          .sheet{padding:0 14px 14px}
          ${BARCODE_STYLE}
          .bc-row,.bc-turn,.bc-grid{position:relative;left:${options.offsetX}mm;top:${options.offsetY}mm}
          @media print{body{background:#fff}.toolbar{display:none}.sheet{padding:0}.bc-label{outline:0}}
          ${page}
        </style></head><body><div class="toolbar"><button onclick="window.print()">Print</button><span>${roll ? `Paper: ${paperSize} mm, no margins, 100% scale` : `Paper: A4 ${options.orient}, 100% scale`}</span></div><div class="sheet">${barcodeSheet(test ? [testLabel()] : barcodeLabels(only))}</div></body></html>`);
        sheet.document.close();
      };
      $("#bcPrint")?.addEventListener("click", () => printLabels());
      $("#bcTest")?.addEventListener("click", () => printLabels(undefined, true));

      // ---- Printing straight to the printer, without the system's printer driver.
      $("#bcContinuous")?.addEventListener("change", () => { options.continuous = $("#bcContinuous").checked; barcodePage(); });
      // How many of the printer's own dots one barcode module gets when printing straight to it.
      const directModule = (code: string) => Math.max(1, fitModule(code, options.width - BARCODE_SIDE * 2, options.dpi).dots);
      const connect = async (open: () => Promise<PrinterLink>) => {
        try {
          PRINTER_LINK = await open();
          toast("Printer connected");
        } catch (error) {
          // Closing the browser's device chooser without choosing is not a failure worth a message.
          if ((error as Error)?.name !== "NotFoundError") toast(error instanceof Error ? error.message : "The printer could not be connected.");
        }
        barcodePage();
      };
      $("#bcBluetooth")?.addEventListener("click", () => void connect(connectBluetooth));
      $("#bcSerial")?.addEventListener("click", () => void connect(connectSerial));
      $("#bcDisconnect")?.addEventListener("click", () => {
        void PRINTER_LINK?.close().catch(() => undefined);
        PRINTER_LINK = null;
        barcodePage();
      });
      const sendDirect = async (jobs: { spec: LabelSpec; copies: number; moduleDots: number; border?: boolean }[]) => {
        if (!PRINTER_LINK) { toast("Connect the printer first"); return; }
        const state = $("#bcLinkState");
        const sideways = options.turn === 90 || options.turn === 270;
        try {
          let sent = 0;
          for (const job of jobs) {
            if (state) state.textContent = `Printing ${++sent} of ${jobs.length}…`;
            const picture = drawLabel(job.spec, {
              widthMm: options.width, heightMm: options.height, barsMm: options.bars, moduleDots: job.moduleDots,
              dotsPerMm: printerDots, turn: options.turn, offsetXMm: options.offsetX, offsetYMm: options.offsetY, border: job.border,
            });
            await PRINTER_LINK.send(tsplJob(picture, {
              widthMm: sideways ? options.height : options.width, heightMm: sideways ? options.width : options.height,
              gapMm: options.continuous ? 0 : 2, copies: job.copies,
            }));
          }
          toast("Sent to the printer");
        } catch (error) {
          console.error("Could not print directly", error);
          PRINTER_LINK = null;
          toast("The printer stopped answering. Connect it again.");
        }
        barcodePage();
      };
      // The labels for every ticked product, or for one listed product when `only` is its id.
      const directJobs = (only?: any) => {
        const points = options.font;
        return BARCODE_ITEMS.filter((item) => (only === undefined ? item.on : item.id == only) && prod(item.id)).map((item) => {
          const product = prod(item.id);
          const price = +product.sell || 0;
          return {
            copies: item.qty,
            moduleDots: directModule(barcodeOf(product)),
            spec: {
              above: [
                ...(options.shop ? [{ text: String(D.user.shop || ""), points: points + 3 }] : []),
                ...(options.name ? [{ text: String(product.name || ""), points }] : []),
                ...(options.price ? [{ text: `Price: ${Number.isInteger(price) ? price : price.toFixed(2)}`, points: points + 2 }] : []),
              ],
              code: barcodeOf(product),
              below: options.code ? [{ text: barcodeOf(product), points }] : [],
            },
          };
        });
      };
      $("#bcDirect")?.addEventListener("click", () => void sendDirect(directJobs()));
      document.querySelectorAll(".bc-print-one").forEach((button) => button.addEventListener("click", () => {
        const id = (button as HTMLElement).dataset.id;
        if (roll && PRINTER_LINK) void sendDirect(directJobs(id));
        else printLabels(id);
      }));
      $("#bcDirectTest")?.addEventListener("click", () => {
        void sendDirect([{
          copies: 1,
          border: true,
          moduleDots: directModule("TEST1234"),
          spec: { above: [{ text: `${options.width} × ${options.height} mm`, points: options.font + 1, bold: true }], code: "TEST1234", below: [{ text: "TEST1234", points: options.font }] },
        }]);
      });
    };

    const backupPage = async () => {
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>Backups</h2><button class="btn pu" id="backupNow">Back up now</button></div><p class="settings-help" style="padding:0 18px">A copy of your shop is saved automatically every day and kept for 30 days. You can download a copy to keep yourself, or put the shop back to how it was on an earlier day.</p><div class="wrap" id="backupList"><p style="padding:18px">Loading…</p></div></section>`;
      const draw = (backups: ShopBackup[]) => {
        const rows = backups.map((backup, index) => {
          const safety = backup.name.startsWith("before-restore-");
          return `<tr><td>${index + 1}</td><td>${esc(new Date(backup.createdAt).toLocaleString())}</td><td>${safety ? "Saved before a restore" : "Daily backup"}</td><td>${(backup.size / 1024).toFixed(1)} KB</td><td><a class="mini" href="${esc(hostingApi.backupDownloadUrl(backup.name))}" download>Download</a><button class="mini restore-backup" data-name="${esc(backup.name)}">Restore</button></td></tr>`;
        }).join("");
        $("#backupList").innerHTML = `<table><thead><tr><th>SL.</th><th>Date</th><th>Type</th><th>Size</th><th>Action</th></tr></thead><tbody>${rows || empty(5)}</tbody></table>`;
        document.querySelectorAll(".restore-backup").forEach((button) => button.addEventListener("click", async () => {
          const name = (button as HTMLElement).dataset.name!;
          if (!confirm("Put the shop back to this backup? Everything changed after it will be undone. A copy of the shop as it is now is saved first.")) return;
          (button as HTMLButtonElement).disabled = true;
          try {
            await hostingApi.restoreBackup(name);
            // Reloading is the simplest way to show the restored shop everywhere on this device.
            unsaved = false;
            window.location.reload();
          } catch (error) {
            (button as HTMLButtonElement).disabled = false;
            toast(error instanceof Error ? error.message : "The backup could not be restored.");
          }
        }));
      };
      $("#backupNow").addEventListener("click", async () => {
        const button = $("#backupNow") as HTMLButtonElement;
        button.disabled = true;
        try {
          draw((await hostingApi.backupNow()).backups);
          toast("Backup saved");
        } catch (error) {
          toast(error instanceof Error ? error.message : "The backup could not be saved.");
        } finally {
          button.disabled = false;
        }
      });
      try {
        const { backups } = await hostingApi.listBackups();
        if ($("#backupList")) draw(backups);
      } catch (error) {
        if ($("#backupList")) $("#backupList").innerHTML = `<p style="padding:18px">${esc(error instanceof Error ? error.message : "Backups could not be loaded.")}</p>`;
      }
    };

    // ---- Platform admin: every shop on the system, payments waiting to be checked, and prices.
    const adminPage = async (view: "shops" | "payments" | "settings") => {
      const title = { shops: "All Shops", payments: "Payments", settings: "Pricing & Payment Numbers" }[view];
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>${title}</h2></div><div class="wrap" id="adminBody"><p style="padding:18px">Loading…</p></div></section>`;
      let overview: Awaited<ReturnType<typeof hostingApi.adminOverview>>;
      try {
        overview = await hostingApi.adminOverview();
      } catch (error) {
        if ($("#adminBody")) $("#adminBody").innerHTML = `<p style="padding:18px">${esc(error instanceof Error ? error.message : "Could not load.")}</p>`;
        return;
      }
      const body = $("#adminBody");
      if (!body) return;
      const run = async (action: "review" | "extend" | "suspend" | "settings" | "verify", payload: AnyData, done: string) => {
        try {
          await hostingApi.adminAction(action, payload);
          toast(done);
          void adminPage(view);
        } catch (error) {
          toast(error instanceof Error ? error.message : "The change could not be saved.");
        }
      };

      if (view === "shops") {
        const rows = overview.shops.map((shop, index) => `<tr><td>${index + 1}</td><td>${esc(shop.name)}</td><td>${esc(shop.ownerName)}<br><small>${esc(shop.ownerEmail)}</small></td><td>${esc(shop.createdAt.slice(0, 10))}</td><td>${shop.staff}</td><td>${shop.records}</td><td>${esc(subscriptionBadge(shop.subscription))}${shop.subscription.emailVerified || shop.subscription.state === "unverified" ? "" : "<br><small>Email not confirmed</small>"}</td><td>${shop.subscription.emailVerified ? "" : `<button class="mini admin-verify" data-id="${esc(shop.id)}">Confirm email</button>`}${shop.subscription.state === "lifetime" ? "" : `<button class="mini admin-extend" data-id="${esc(shop.id)}" data-days="30">+30 days</button><button class="mini admin-extend" data-id="${esc(shop.id)}" data-days="365">+1 year</button><button class="mini admin-suspend" data-id="${esc(shop.id)}" data-on="${shop.subscription.state === "suspended" ? "0" : "1"}">${shop.subscription.state === "suspended" ? "Restore" : "Suspend"}</button>`}</td></tr>`).join("");
        body.innerHTML = `<table><thead><tr><th>SL.</th><th>Shop</th><th>Owner</th><th>Joined</th><th>Staff</th><th>Records</th><th>Subscription</th><th>Action</th></tr></thead><tbody>${rows || empty(8)}</tbody></table>`;
        body.querySelectorAll(".admin-extend").forEach((button: Element) => button.addEventListener("click", () => {
          const { id, days } = (button as HTMLElement).dataset;
          if (confirm(`Add ${days} days to this shop?`)) void run("extend", { shopId: id, days: +days! }, "Days added");
        }));
        body.querySelectorAll(".admin-verify").forEach((button: Element) => button.addEventListener("click", () => {
          if (confirm("Mark this owner's email as confirmed without the link?")) void run("verify", { shopId: (button as HTMLElement).dataset.id }, "Email confirmed");
        }));
        body.querySelectorAll(".admin-suspend").forEach((button: Element) => button.addEventListener("click", () => {
          const { id, on } = (button as HTMLElement).dataset;
          if (confirm(on === "1" ? "Suspend this shop? Nobody in it will be able to save anything." : "Restore this shop?")) void run("suspend", { shopId: id, suspended: on === "1" }, on === "1" ? "Shop suspended" : "Shop restored");
        }));
      } else if (view === "payments") {
        const rows = overview.payments.map((payment, index) => `<tr><td>${index + 1}</td><td>${esc(payment.createdAt)}</td><td>${esc(payment.shopName)}<br><small>${esc(payment.ownerEmail)}</small></td><td>${esc(payment.plan)}</td><td>${money(payment.amount)}</td><td>${esc(payment.method)}<br><small>${esc(payment.sender)}</small></td><td>${esc(payment.trxId)}</td><td>${esc(payment.status)}${payment.note ? `<br><small>${esc(payment.note)}</small>` : ""}</td><td>${payment.status === "pending" ? `<button class="mini admin-approve" data-id="${payment.id}">Approve</button><button class="mini admin-reject" data-id="${payment.id}">Reject</button>` : ""}</td></tr>`).join("");
        body.innerHTML = `<p class="settings-help" style="padding:0 18px">Check each Transaction ID in your bKash or Nagad app before approving. Approving adds the paid period to the shop straight away.</p><table><thead><tr><th>SL.</th><th>Date</th><th>Shop</th><th>Plan</th><th>Amount</th><th>Sent from</th><th>Transaction ID</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || empty(9)}</tbody></table>`;
        body.querySelectorAll(".admin-approve").forEach((button: Element) => button.addEventListener("click", () => {
          if (confirm("Approve this payment? Make sure the money has arrived.")) void run("review", { id: +(button as HTMLElement).dataset.id!, approve: true }, "Payment approved");
        }));
        body.querySelectorAll(".admin-reject").forEach((button: Element) => button.addEventListener("click", () => {
          const note = prompt("Reason shown to the shop owner (optional):", "Transaction not found");
          if (note !== null) void run("review", { id: +(button as HTMLElement).dataset.id!, approve: false, note }, "Payment rejected");
        }));
      } else {
        const s = overview.settings;
        body.innerHTML = `<form id="adminSettingsForm" style="padding:0 18px 18px"><div class="settings-form-grid"><label>Monthly price (Taka)<input id="adminMonthly" type="number" min="0" step="1" value="${s.priceMonthly}" required></label><label>Yearly price (Taka)<input id="adminYearly" type="number" min="0" step="1" value="${s.priceYearly}" required></label><label>Free trial (days)<input id="adminTrial" type="number" min="0" max="365" step="1" value="${s.trialDays}" required></label><label>Days allowed before email must be confirmed<input id="adminGrace" type="number" min="0" max="365" step="1" value="${s.verifyGraceDays}" required></label><label>Support phone<input id="adminSupport" type="tel" value="${esc(s.supportPhone)}"></label><label>bKash number (customers send money here)<input id="adminBkash" type="tel" value="${esc(s.bkashNumber)}" placeholder="01XXXXXXXXX"></label><label>Nagad number<input id="adminNagad" type="tel" value="${esc(s.nagadNumber)}" placeholder="01XXXXXXXXX"></label></div><button class="btn pu" type="submit">Save Changes</button></form>`;
        $("#adminSettingsForm").addEventListener("submit", (event: Event) => {
          event.preventDefault();
          void run("settings", {
            price_monthly: +$("#adminMonthly").value, price_yearly: +$("#adminYearly").value, trial_days: +$("#adminTrial").value, verify_grace_days: +$("#adminGrace").value,
            support_phone: $("#adminSupport").value, bkash_number: $("#adminBkash").value, nagad_number: $("#adminNagad").value,
          }, "Settings saved");
        });
      }
    };

    const subscriptionPage = () => {
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>Subscription</h2></div><div style="padding:0 18px 18px"><div id="subscriptionPanel"></div></div></section>`;
      void mountSubscriptionPanel($("#subscriptionPanel"));
    };

    const notesPage = () => {
      const rows = D.notes.map((note: any, index: number) => `<tr><td>${index + 1}</td><td>${esc(note.title)}</td><td>${esc(note.body)}</td><td>${esc(note.date)}</td><td><button class="mini edit-note" data-id="${note.id}">Edit</button><button class="mini delete-note" data-id="${note.id}">Delete</button></td></tr>`).join("");
      $("#app").innerHTML = `<section class="card"><div class="hd"><h2>Notes</h2><button class="btn pu" id="addNote">+ Add Note</button></div><div class="wrap"><table><thead><tr><th>SL.</th><th>Title</th><th>Note</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows || empty(5)}</tbody></table></div></section>`;
      $("#addNote").addEventListener("click", () => noteForm());
      document.querySelectorAll(".edit-note").forEach((button) => button.addEventListener("click", () => noteForm(+(button as HTMLElement).dataset.id!)));
      document.querySelectorAll(".delete-note").forEach((button) => button.addEventListener("click", () => {
        const id = +(button as HTMLElement).dataset.id!;
        if (confirm("Delete this note?")) { D.notes = D.notes.filter((note: any) => note.id !== id); save(); notesPage(); }
      }));
    };

    const noteForm = (id?: number) => {
      const note = id ? D.notes.find((entry: any) => entry.id === id) : null;
      $("#dlg").innerHTML = `<h3>${note ? "Edit" : "Add"} Note</h3><label>Title</label><input id="noteTitle" value="${esc(note?.title || "")}" placeholder="Note title"><label>Note</label><textarea id="noteBody" rows="5" style="width:100%;background:var(--in);color:var(--tx);border:1px solid var(--ln);border-radius:8px;padding:9px 11px">${esc(note?.body || "")}</textarea><div class="two" style="margin-top:16px"><button class="btn or" id="cancelNote" type="button">Cancel</button><button class="btn pu" id="saveNote" type="button">Save</button></div>`;
      $("#dlg").showModal();
      $("#cancelNote").addEventListener("click", () => $("#dlg").close());
      $("#saveNote").addEventListener("click", () => {
        const title = $("#noteTitle").value.trim();
        const body = $("#noteBody").value.trim();
        if (!title || !body) { toast("Enter a title and note"); return; }
        if (note) Object.assign(note, { title, body, date: today() });
        else D.notes.unshift({ id: uid(), title, body, date: today() });
        save(); $("#dlg").close(); notesPage(); toast("Note saved");
      });
    };

    const P: AnyData = {
      products: productList,
      "settings-currencies": currencyPage,
      "settings-notifications": notificationsPage,
      "settings-general": generalSettingsPage,
      "settings-roles": rolesPage,
      "settings-notes": notesPage,
      "settings-backup": backupPage,
      "barcodes": barcodePage,
      "settings-subscription": subscriptionPage,
      "admin-shops": () => adminPage("shops"),
      "admin-payments": () => adminPage("payments"),
      "admin-settings": () => adminPage("settings"),

      dashboard: () => {
        const cm = today().slice(0, 7);

        const ms = (a: any[]) =>
          a.filter(
            (x) =>
              x.date?.startsWith(cm),
          );

        const S = sum(
          ms(D.sales),
          (s) => s.total,
        );

        const Pu = sum(
          ms(D.purchases),
          (s) => s.total,
        );

        const E = sum(
          ms(D.expenses),
          (s) => s.amount,
        );

        const net =
          sum(
            ms(D.sales),
            (s) => s.p,
          ) - E;

        const cs = [
          [
            "Total Sales",
            tk(S),
            "#8b5cf6",
            "🏷",
          ],
          [
            "Total Purchase",
            tk(Pu),
            "#ff8a1f",
            "🛒",
          ],
          [
            "Total Expense",
            tk(E),
            "#ef4444",
            "💵",
          ],
          [
            "Total Customer",
            D.customers.length,
            "#22a6d8",
            "👥",
          ],
          [
            "Total Supplier",
            D.suppliers.length,
            "#84cc16",
            "🧑‍💼",
          ],
          [
            "Sales Returns",
            tk(
              sum(
                D.sr,
                (r) => r.total,
              ),
            ),
            "#6366f1",
            "↩",
          ],
          [
            "Net Profit",
            tk(net),
            "#d946ef",
            "💰",
          ],
          [
            "Purchase Returns",
            tk(
              sum(
                D.pr,
                (r) => r.total,
              ),
            ),
            "#d946ef",
            "↩",
          ],
          [
            "Today's Courier Orders",
            "0",
            "#d946ef",
            "🚚",
          ],
        ];

        const yr =
          new Date().getFullYear();

        const mp = [...Array(12)].map(
          (_, m) =>
            sum(
              D.sales.filter(
                (s: any) =>
                  s.date?.startsWith(
                    yr +
                      "-" +
                      String(
                        m + 1,
                      ).padStart(
                        2,
                        "0",
                      ),
                  ),
              ),
              (s) => s.p,
            ),
        );

        const mx = Math.max(
          1,
          ...mp,
        );

        const pts = mp
          .map(
            (v, i) =>
              `${40 + i * 46},${
                170 -
                (Math.max(v, 0) /
                  mx) *
                  150
              }`,
          )
          .join(" ");

        const Ta =
          Pu + S + E;

        const a = Ta
          ? (Pu / Ta) * 100
          : 33;

        const b = Ta
          ? a +
            (S / Ta) * 100
          : 66;

        const low = lowStockProducts();

        $("#app").innerHTML = `

          <div class="stats">

            ${cs
              .map(
                (c) => `
                  <div>

                    <span>${c[0]}</span>

                    <b>${c[1]}</b>

                    <i>
                      ↗ ${c[1]} This Month
                    </i>

                    <em
                      style="
                        background:${c[2]};
                        color:#fff
                      "
                    >
                      ${c[0] === "Total Sales" ? '<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 13h8"/><path d="M9 16h.01M15 16h.01"/></svg>' : c[0] === "Total Purchase" ? '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 11.5a2 2 0 0 0 2 1.5h8.9a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>' : c[0] === "Total Expense" ? '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' : c[0] === "Total Customer" || c[0] === "Total Supplier" ? '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></svg>' : c[0] === "Sales Returns" || c[0] === "Purchase Returns" ? '<svg viewBox="0 0 24 24"><path d="M3 10V5h5M4 5a9 9 0 1 1-1 9"/><path d="m8 12 4-4 4 4M12 8v9"/></svg>' : c[0] === "Net Profit" ? '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M7 15h4M16 13v4M14 15h4"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>'}
                    </em>

                  </div>
                `,
              )
              .join("")}

          </div>

          <div
            class="card"
            style="margin-top:16px"
          >

            <h3>
              Revenue Statistic ${yr}
            </h3>

            <div class="lg">

              <span>
                🟣 Gross Profit:
                <b>
                  ${tk(
                    sum(
                      mp,
                      (x) => x,
                    ),
                  )}
                </b>
              </span>

              <span>
                🔴 Loss:
                <b>${tk(E)}</b>
              </span>

              <span>
                🟢 Net Profit:
                <b>${tk(net)}</b>
              </span>

            </div>

            <svg
              viewBox="0 0 600 200"
              style="width:100%"
            >

              <g
                stroke="var(--ln)"
              >
                ${[
                  20,
                  70,
                  120,
                  170,
                ]
                  .map(
                    (y) =>
                      `<line
                        x1="30"
                        x2="590"
                        y1="${y}"
                        y2="${y}"
                      />`,
                  )
                  .join("")}
              </g>

              <polyline
                points="${pts}"
                fill="none"
                stroke="#a21caf"
                stroke-width="3"
              />

              ${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec"
                .split(" ")
                .map(
                  (m, i) =>
                    `<text
                      x="${40 + i * 46}"
                      y="192"
                      font-size="11"
                      fill="var(--mut)"
                      text-anchor="middle"
                    >
                      ${m}
                    </text>`,
                )
                .join("")}

            </svg>

          </div>

          <div class="g2">

            <div class="card">

              <div class="hd">
                <h3>Low Stock</h3>
              </div>

              ${tabInner(
                [
                  "SL.",
                  "Name",
                  "Alert Qty",
                  "Current Stock",
                ],
                low.map(
                  (p: any, i: number) => [
                    i + 1,
                    esc(p.name),
                    alertQty(p),
                    p.stock,
                  ],
                ),
              )}

            </div>

            <div class="card">

              <h3>
                Overall Reports ${yr}
              </h3>

              <div class="lg">

                <div
                  class="pie"
                  style="
                    background:
                    conic-gradient(
                      #ffb15c 0 ${a}%,
                      #b9a2ff ${a}% ${b}%,
                      #ff4d4d ${b}% 100%
                    )
                  "
                ></div>

                <div>
                  🟠 Purchase:
                  <b>${tk(Pu)}</b>

                  <br>

                  🟣 Sales:
                  <b>${tk(S)}</b>

                  <br>

                  🔴 Expense:
                  <b>${tk(E)}</b>
                </div>

              </div>

            </div>

          </div>

          <div class="card">

            <div class="tabs">

              <button
                class="on"
                id="recentSalesTab"
              >
                Recent Sales
              </button>

              <button
                id="recentPurchaseTab"
              >
                Recent Purchase
              </button>

            </div>

            <div id="rt"></div>

          </div>
        `;

        const rs =
          document.getElementById(
            "recentSalesTab",
          );

        const rp =
          document.getElementById(
            "recentPurchaseTab",
          );

        rs?.addEventListener(
          "click",
          () =>
            rtab(
              rs as HTMLElement,
              "s",
            ),
        );

        rp?.addEventListener(
          "click",
          () =>
            rtab(
              rp as HTMLElement,
              "p",
            ),
        );

        if (rs) {
          rtab(
            rs as HTMLElement,
            "s",
          );
        }
      },

      "sale-new": () =>
        pos("sale"),

      "purchase-new": () =>
        pos("purchase"),

      sales: () => {
        $("#app").innerHTML = tab(
          "Sales List",
          [
            "Date",
            "Invoice No",
            "Party Name",
            "Serial No.",
            "Total",
            "Discount",
            "Paid",
            "Due",
            "Payment",
            "Status",
            "Action",
          ],
          D.sales.map(
            (s: any) => [
              s.date,
              s.inv,
              esc(s.party),
              esc((s.items || []).flatMap((item: any) => item.serials || []).join(", ") || "-"),
              tk(s.total),
              tk(s.disc),
              tk(s.paid),
              tk(s.due),
              s.pay,
              s.ret
                ? "Returned"
                : `<span class="bd ${
                    s.due > 0
                      ? "dn"
                      : "ok"
                  }">
                    ${
                      s.due > 0
                        ? "Due"
                        : "Paid"
                    }
                  </span>`,
              `<div class="action-cell">
                <button class="action-trigger" aria-label="Actions" aria-haspopup="menu" onclick="showActionMenu(event,${s.id})"><span class="more-dots" aria-hidden="true"><i></i><i></i><i></i></span></button>
                <div id="sale-actions-${s.id}" class="action-menu" popover>
                  <button onclick="this.closest('[popover]').hidePopover();invoice(${s.id})"><svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5M10 13h6M10 17h6"/></svg>Invoice</button>
                  <button onclick="this.closest('[popover]').hidePopover();printInvoice(${s.id})"><svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7zM17 11h.01"/></svg>POS Invoice</button>
                  ${s.ret ? "" : `<button onclick="this.closest('[popover]').hidePopover();ret('sales',${s.id})"><svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6L3 13"/></svg>Sales Return</button>`}
                  <button onclick="this.closest('[popover]').hidePopover();editSale(${s.id})"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>Edit</button>
                  <button onclick="this.closest('[popover]').hidePopover();del('sales',${s.id})"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/></svg>Delete</button>
                </div>
              </div>`,
            ],
          ),
          `<a
            class="btn pu"
            style="text-decoration:none"
            href="#sale-new"
          >
            ＋ Sale New
          </a>`,
        );
      },

      purchases: () => {
        $("#app").innerHTML = tab(
          "Purchase List",
          [
            "Date",
            "Invoice No",
            "Party Name",
            "Total",
            "Discount",
            "Paid",
            "Due",
            "Payment",
            "Status",
            "Action",
          ],
          D.purchases.map(
            (s: any) => [
              s.date,
              s.inv,
              esc(s.party),
              tk(s.total),
              tk(s.disc),
              tk(s.paid),
              tk(s.due),
              s.pay,
              s.ret
                ? "Returned"
                : `<span class="bd ${
                    s.due > 0
                      ? "dn"
                      : "ok"
                  }">
                    ${
                      s.due > 0
                        ? "Due"
                        : "Paid"
                    }
                  </span>`,
              s.ret
                ? ""
                : `<button
                    class="mini"
                    onclick="ret('purchases',${s.id})"
                  >
                    Return
                  </button>`,
            ],
          ),
          `<a
            class="btn pu"
            style="text-decoration:none"
            href="#purchase-new"
          >
            ＋ Purchase New
          </a>`,
        );
      },

      "sale-returns": () => {
        $("#app").innerHTML = tab(
          "Sales Return List",
          [
            "Invoice No",
            "Date",
            "Name",
            "Total",
            "Paid",
            "Return Amount",
          ],
          D.sr.map(
            (r: any) => [
              r.inv,
              r.date,
              esc(r.name),
              tk(r.total),
              tk(r.paid),
              tk(r.total),
            ],
          ),
        );
      },

      "purchase-returns": () => {
        $("#app").innerHTML = tab(
          "Purchase Return List",
          [
            "Invoice No",
            "Date",
            "Name",
            "Total",
            "Paid",
            "Return Amount",
          ],
          D.pr.map(
            (r: any) => [
              r.inv,
              r.date,
              esc(r.name),
              tk(r.total),
              tk(r.paid),
              tk(r.total),
            ],
          ),
        );
      },

      "product-add": productForm,

      stocks: () => {
        $("#app").innerHTML = tab(
          "Stock List",
          [
            "Product",
            "Cost",
            "Qty",
            "Sale",
            "Stock Value",
          ],
          D.products.map(
            (p: any) => [
              esc(p.name),
              tk(p.buy),
              p.stock,
              tk(p.sell),
              tk(
                p.buy * p.stock,
              ),
            ],
          ),
          `<b>
            Total stock value:
            ${tk(
              sum(
                D.products,
                (p) =>
                  p.buy *
                  p.stock,
              ),
            )}
          </b>`,
        );
      },

      dues: () => {
        const r: any[][] = [];

        D.sales.forEach(
          (s: any) => {
            if (
              s.due > 0 &&
              !s.ret
            ) {
              r.push([
                "Customer",
                esc(s.party),
                s.inv,
                tk(s.due),
              ]);
            }
          },
        );

        D.purchases.forEach(
          (s: any) => {
            if (
              s.due > 0 &&
              !s.ret
            ) {
              r.push([
                "Supplier",
                esc(s.party),
                s.inv,
                tk(s.due),
              ]);
            }
          },
        );

        $("#app").innerHTML = tab(
          "Due List",
          [
            "Type",
            "Party",
            "Invoice",
            "Due",
          ],
          r,
        );
      },

      profit: () => {
        let mode: "invoice" | "product" = "invoice";
        let query = "";
        let from = "";
        let to = "";
        let pageSize = 10;
        let page = 1;
        const profitRows = () => {
          if (mode === "invoice") return D.sales.map((s: any) => ({
            inv: s.inv, name: s.party || "-", total: +s.total || 0,
            profit: +s.p || 0, date: s.date, status: s.ret ? "Returned" : (+s.due > 0 ? "Due" : "Paid"),
          }));
          return D.sales.flatMap((s: any) => (s.items || []).map((item: any) => {
            const p = prod(item.id);
            const qty = +item.qty || 0;
            const gross = (+(item.price || 0) - +(p?.buy || 0)) * qty;
            return { inv: s.inv, name: p?.name || item.name || "Product", total: (+(item.price || 0) * qty), profit: gross, date: s.date, status: s.ret ? "Returned" : (+s.due > 0 ? "Due" : "Paid") };
          }));
        };
        const escHtml = (v: any) => esc(v);
        const filtered = () => profitRows().filter((r: any) => {
          const d = String(r.date || "");
          const q = query.toLowerCase();
          return (!q || `${r.inv} ${r.name} ${r.status}`.toLowerCase().includes(q)) && (!from || d >= from) && (!to || d <= to);
        });
        const stats = (rows: any[]) => ({
          loss: sum(rows, (r) => r.profit < 0 ? -r.profit : 0),
          gross: sum(rows, (r) => r.profit > 0 ? r.profit : 0),
          net: sum(rows, (r) => r.profit),
          sales: mode === "invoice" ? rows.length : new Set(rows.map((r) => r.inv)).size,
        });
        const draw = () => {
          const all = profitRows();
          const rows = filtered();
          const pages = Math.max(1, Math.ceil(rows.length / pageSize));
          page = Math.min(page, pages);
          const visible = rows.slice((page - 1) * pageSize, page * pageSize);
          const curr = stats(visible);
          const total = stats(all);
          const cards = (s: any, label: string) => [
            ["Loss", tk(s.loss), "#d8effc"], ["Gross Profit", tk(s.gross), "#cef4e3"],
            ["Net Profit", tk(s.net), "#cef4e3"], ["Total Sale", s.sales, "#ffe8cc"],
          ].map((x: any) => `<div class="profit-stat" style="background:${x[2]}"><span>${x[0]}</span><b>${x[1]}</b><small>${label}</small></div>`).join("");
          const heads = mode === "invoice" ? ["SL.", "Invoice", "Name", "Total", "Gross Loss/Profit", "Date", "Status"] : ["SL.", "Invoice", "Product", "Total", "Gross Loss/Profit", "Date", "Status"];
          const body = visible.map((r: any, i: number) => `<tr><td>${(page-1)*pageSize+i+1}</td><td>${escHtml(r.inv)}</td><td>${escHtml(r.name)}</td><td>${tk(r.total)}</td><td style="color:${r.profit < 0 ? "#ef3340" : "#16a34a"}">${tk(r.profit)}</td><td>${escHtml(r.date || "-")}</td><td><span class="bd ${r.status === "Paid" ? "ok" : "dn"}">${r.status}</span></td></tr>`).join("") || `<tr><td class="mut" colspan="7">No data found</td></tr>`;
          $("#app").innerHTML = `<div class="card profit-page"><div class="profit-heading"><h2>Gross Loss Profit List</h2><div><button class="btn ${mode === "invoice" ? "gn" : "ib"}" id="invoiceMode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18"/><path d="M6 16v-5h3v5M11 16V6h3v10M16 16v-7h3v7"/></svg> Invoice Wise</button><button class="ib ${mode === "product" ? "profit-selected" : ""}" id="productMode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg> Product Wise</button></div></div><div class="profit-stats">${cards(curr,"Current Page")}${cards(total,"All Pages")}</div><div class="profit-filters"><select id="profitPageSize" aria-label="Rows per page"><option value="10" ${pageSize===10?"selected":""}>Show- 10</option><option value="25" ${pageSize===25?"selected":""}>Show- 25</option><option value="50" ${pageSize===50?"selected":""}>Show- 50</option></select><input id="profitSearch" placeholder="Search..." value="${escHtml(query)}"><label>Select Date Range<div class="profit-date-range"><input id="profitFrom" type="date" value="${from}"><span>to</span><input id="profitTo" type="date" value="${to}"></div></label></div><div class="profit-export"><button id="profitCsv" title="Export CSV"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13l5 5m0-5-5 5"/><path d="M3 6v16"/></svg></button><button id="profitPdf" title="Save PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 17v-5h2a1.5 1.5 0 0 1 0 3H9m5 2v-5h1a2.5 2.5 0 0 1 0 5h-1"/></svg></button><button id="profitPrint" title="Print"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3"/><path d="M7 14h10v7H7zM17 11h.01"/></svg></button></div><div class="wrap"><table class="profit-table"><thead><tr>${heads.map((h:string)=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div><div class="product-page-footer"><span>Showing ${rows.length ? (page-1)*pageSize+1 : 0} to ${Math.min(page*pageSize,rows.length)} of ${rows.length} entries</span><div><button id="profitPrev" ${page<=1?"disabled":""}>Previous</button><span> ${page} / ${pages} </span><button id="profitNext" ${page>=pages?"disabled":""}>Next</button></div></div></div>`;
          $("#invoiceMode").onclick = () => { mode="invoice"; page=1; draw(); };
          $("#productMode").onclick = () => { mode="product"; page=1; draw(); };
          $("#profitSearch").oninput = (e: any) => { query=e.target.value; page=1; draw(); const el=$("#profitSearch"); el.focus(); el.setSelectionRange(query.length,query.length); };
          $("#profitFrom").onchange = (e: any) => { from=e.target.value; page=1; draw(); };
          $("#profitTo").onchange = (e: any) => { to=e.target.value; page=1; draw(); };
          $("#profitPageSize").onchange = (e: any) => { pageSize=+e.target.value; page=1; draw(); };
          $("#profitPrev").onclick = () => { page--; draw(); };
          $("#profitNext").onclick = () => { page++; draw(); };
          $("#profitPrint").onclick = () => window.print();
          $("#profitCsv").onclick = () => { const csv=[heads,...visible.map((r:any,i:number)=>[(page-1)*pageSize+i+1,r.inv,r.name,r.total.toFixed(2),r.profit.toFixed(2),r.date,r.status])].map((row:any[])=>row.map((v:any)=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="gross-loss-profit.csv"; a.click(); URL.revokeObjectURL(a.href); };
          $("#profitPdf").onclick = () => window.print();
        };
        draw();
      },
      profile: () => {
        const u = D.user;
        const remaining = u.open + sum(D.sales, (sale: any) => sale.paid) - sum(D.purchases, (purchase: any) => purchase.paid) - sum(D.expenses, (expense: any) => expense.amount);
        const joinedDate = new Date(String(sessionUser.created_at || "").replace(" ", "T"));
        const joined = Number.isNaN(joinedDate.getTime()) ? "Not available" : joinedDate.toLocaleDateString();
        const avatarMarkup = u.avatar?.startsWith("data:image/")
          ? `<img src="${esc(u.avatar)}" alt="Profile picture">`
          : esc((u.name?.[0] || "A").toUpperCase());

        $("#app").innerHTML = `
          <div class="profile-layout">
            <section class="card profile-card">
              <div class="profile-cover"></div>
              <div class="profile-avatar" id="profileAvatar">${avatarMarkup}</div>
              <div class="profile-summary">
                <div>Shop Opening Balance: <b>${tk(u.open)}</b></div>
                <div>Shop Remaining Balance: <b>${tk(remaining)}</b></div>
                <div>Registration Date: ${esc(joined)}</div>
                <div>Plan Expire Date: ${esc(u.planExpiry || "Not set")}</div>
              </div>
            </section>
            <section class="card profile-form-card">
              <h2>User Profile</h2>
              <form class="profile-form" id="profileForm">
                <label for="profileName">Name</label>
                <input id="profileName" value="${esc(sessionUser.display_name || u.name)}" required>
                <label for="profileEmail">Email</label>
                <input id="profileEmail" type="email" value="${esc(sessionUser.email || u.email)}" required>
                ${isWorkspaceOwner ? `<label for="profilePhoto">Profile Picture (max ${MAX_IMAGE_FILE_KB} KB)</label>
                <input id="profilePhoto" type="file" accept="image/*">` : ""}
                <label for="profileCurrentPassword">Current Password</label>
                <input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="Enter your current password">
                <label for="profileNewPassword">New Password</label>
                <input id="profileNewPassword" type="password" autocomplete="new-password" placeholder="Enter new password" minlength="8">
                <label for="profileConfirmPassword">Confirm password</label>
                <input id="profileConfirmPassword" type="password" autocomplete="new-password" placeholder="Enter confirm password">
                ${isWorkspaceOwner ? `<label for="profileOpeningBalance">Shop Opening Balance</label>
                <input id="profileOpeningBalance" type="number" min="0" step="0.01" value="${+u.open || 0}">` : ""}
                <button class="btn pu profile-save" type="submit">Save Changes</button>
              </form>
            </section>
          </div>`;

        $("#profilePhoto")?.addEventListener("change", (event: Event) => {
          const file = (event.currentTarget as HTMLInputElement).files?.[0];
          if (!file) return;
          const objectUrl = URL.createObjectURL(file);
          const avatar = $("#profileAvatar");
          if (avatar) avatar.innerHTML = `<img src="${objectUrl}" alt="Profile picture preview">`;
        });

        $("#profileForm")?.addEventListener("submit", async (event: Event) => {
          event.preventDefault();
          const name = $("#profileName").value.trim();
          const email = $("#profileEmail").value.trim().toLowerCase();
          const currentPassword = $("#profileCurrentPassword").value;
          const newPassword = $("#profileNewPassword").value;
          const confirmPassword = $("#profileConfirmPassword").value;
          if (newPassword && newPassword !== confirmPassword) {
            toast("New password and confirmation do not match");
            return;
          }
          if (newPassword && newPassword.length < 8) {
            toast("Password must be at least 8 characters");
            return;
          }
          const needsPassword = Boolean(newPassword || email !== sessionUser.email.toLowerCase());
          if (needsPassword && !currentPassword) {
            toast("Enter your current password to change email or password");
            return;
          }
          const imageFile = $("#profilePhoto")?.files?.[0] as File | undefined;
          let avatar = u.avatar || "";
          if (imageFile) {
            try {
              avatar = await optimizeProductImage(imageFile);
            } catch {
              toast("Could not load this profile picture");
              return;
            }
          }
          try {
            const updated = await hostingApi.updateProfile(name, email, currentPassword, newPassword);
            sessionUser = updated.user;
            // Staff share the owner's shop record, so only the owner edits it here.
            if (isWorkspaceOwner) {
              D.user = {
                ...D.user,
                name,
                email,
                avatar,
                open: Math.max(0, +$("#profileOpeningBalance").value || 0),
              };
              save();
            }
            hdr();
            render();
            toast("Profile updated");
          } catch (error) {
            toast(error instanceof Error ? error.message : "Profile could not be updated. Check your details and try again.");
          }
        });
      },
    };

    const M: any[] = [
      [
        "Dashboard",
        "🏠",
        "dashboard",
      ],

      [
        "Sales",
        "🛒",
        [
          ["Sale New", "sale-new"],
          ["Sale List", "sales"],
          [
            "Sales Return",
            "sale-returns",
          ],
        ],
      ],

      [
        "Purchases",
        "🧾",
        [
          [
            "Purchase New",
            "purchase-new",
          ],
          [
            "Purchase List",
            "purchases",
          ],
          [
            "Purchase Return",
            "purchase-returns",
          ],
        ],
      ],

      [
        "Products",
        "📦",
        [
          [
            "All Product",
            "products",
          ],
          [
            "Add Product",
            "product-add",
          ],
          [
            "Print Barcode",
            "barcodes",
          ],
          [
            "Category",
            "categories",
          ],
          [
            "Brand",
            "brands",
          ],
          [
            "Unit",
            "units",
          ],
        ],
      ],

      [
        "Stock List",
        "📦",
        "stocks",
      ],

      [
        "Employee",
        "👤",
        "employees",
      ],

      [
        "Salary Slip",
        "🧾",
        "salary",
      ],

      [
        "Warehouse",
        "🏬",
        "warehouses",
      ],

      [
        "Warehouse Transfer",
        "🔁",
        "transfers",
      ],

      [
        "Customers",
        "👥",
        "customers",
      ],

      [
        "Suppliers",
        "🧑‍💼",
        "suppliers",
      ],

      [
        "Expenses",
        "💸",
        "expenses",
      ],

      [
        "Due List",
        "⏳",
        "dues",
      ],

      [
        "Subscription",
        "💳",
        "settings-subscription",
      ],

      [
        "Profit & Loss List",
        "📈",
        "profit",
      ],

      [
        "Profile",
        "⚙️",
        "profile",
      ],
      [
        "Settings",
        "<svg class=\"menu-setting-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z\"/><path d=\"M19.4 15.2a1.7 1.7 0 0 0 1.1-1.6v-1.2a1.7 1.7 0 0 0-1.1-1.6l-.8-.3a7 7 0 0 0-.6-1.4l.3-.8a1.7 1.7 0 0 0-.4-1.9l-.9-.9a1.7 1.7 0 0 0-1.9-.4l-.8.3a7 7 0 0 0-1.4-.6l-.3-.8A1.7 1.7 0 0 0 11 3.1H9.8a1.7 1.7 0 0 0-1.6 1.1l-.3.8a7 7 0 0 0-1.4.6l-.8-.3a1.7 1.7 0 0 0-1.9.4l-.9.9a1.7 1.7 0 0 0-.4 1.9l.3.8a7 7 0 0 0-.6 1.4l-.8.3a1.7 1.7 0 0 0-1.1 1.6v1.2a1.7 1.7 0 0 0 1.1 1.6l.8.3a7 7 0 0 0 .6 1.4l-.3.8a1.7 1.7 0 0 0 .4 1.9l.9.9a1.7 1.7 0 0 0 1.9.4l.8-.3a7 7 0 0 0 1.4.6l.3.8a1.7 1.7 0 0 0 1.6 1.1H11a1.7 1.7 0 0 0 1.6-1.1l.3-.8a7 7 0 0 0 1.4-.6l.8.3a1.7 1.7 0 0 0 1.9-.4l.9-.9a1.7 1.7 0 0 0 .4-1.9l-.3-.8a7 7 0 0 0 .6-1.4Z\"/></svg>",
        [
          ["Currencies", "settings-currencies"],
          ["Notifications", "settings-notifications"],
          ["General Settings", "settings-general"],
          ["User Role", "settings-roles"],
          ["Notes", "settings-notes"],
          ["Backup", "settings-backup"],
        ],
      ],

      [
        "Admin",
        "🛡️",
        [
          ["All Shops", "admin-shops"],
          ["Payments", "admin-payments"],
          ["Pricing", "admin-settings"],
        ],
      ],
    ];

    const hdr = () => {
      const un = $("#un");
      const ua = $("#ua");
      const visibleName = sessionUser.display_name || D.user.name;
      const brand = $("#shopBrand");

      if (brand) {
        brand.innerHTML = `${D.user.logo ? `<img src="${esc(D.user.logo)}" alt="">` : ""}<span>${esc(D.user.shop || "My Shop")}</span><small>HishabPOS</small>`;
      }

      if (un) {
        un.textContent = visibleName;
      }

      if (ua) {
        ua.innerHTML = D.user.avatar?.startsWith("data:image/")
          ? `<img src="${esc(D.user.avatar)}" alt="Profile">`
          : esc((visibleName?.[0] || "A").toUpperCase());
      }
    };

    const render = () => {
      updateBell();
      const r =
        location.hash.slice(1) ||
        "dashboard";

      const menu = $("#menu");

      if (!menu) return;

      const role = D.roles?.find((entry: any) => entry.id == (isWorkspaceOwner ? D.user.roleId : activeRoleId));
      const permissions: string[] = role?.permissions || (isWorkspaceOwner ? ["All permissions"] : []);
      const hasAllPermissions = isWorkspaceOwner || permissions.includes("All permissions");
      const navItems: any[] = M.map((item: any[]) => {
            // The platform admin's own section; no shop role can grant it.
            if (item[0] === "Admin") return isAdmin ? item : null;
            if (item[0] === "Subscription") return isWorkspaceOwner ? item : null;
            if (Array.isArray(item[2])) {
              const children = item[2].filter((child: any[]) =>
                (isWorkspaceOwner || !["settings-roles", "settings-backup", "settings-subscription"].includes(child[1])) &&
                (hasAllPermissions || permissions.includes(item[0]) || permissions.includes(child[0])),
              );
              return children.length ? [item[0], item[1], children] : null;
            }
            return hasAllPermissions || permissions.includes(item[0]) ? item : null;
          }).filter(Boolean);
      const routeVisible = navItems.some((item: any[]) => Array.isArray(item[2])
        ? item[2].some((child: any[]) => child[1] === r)
        : item[2] === r);
      if (!routeVisible) {
        const firstItem = navItems[0];
        const firstRoute = firstItem && (Array.isArray(firstItem[2]) ? firstItem[2][0]?.[1] : firstItem[2]);
        if (firstRoute && firstRoute !== r) { location.hash = firstRoute; return; }
        if (!firstRoute) {
          $("#app").innerHTML = `<section class="card"><h2>Access restricted</h2><p>Your account has not been assigned access to any section.</p></section>`;
          return;
        }
      }

      menu.innerHTML = navItems.map(
        (m: any[]) =>
          Array.isArray(m[2])
            ? `
              <div
                class="grp ${
                  m[2].some(
                    (x: any[]) =>
                      x[1] == r,
                  )
                    ? "open"
                    : ""
                }"
              >

                <div
                  class="gh ${
                    m[2].some(
                      (x: any[]) =>
                        x[1] == r,
                    )
                      ? "on"
                      : ""
                  }"
                  data-group="${m[0]}"
                >

                  <span>
                    ${m[1]} ${m[0]}
                  </span>

                  <span>›</span>

                </div>

                <div class="sub">

                  ${m[2]
                    .map(
                      (
                        x: any[],
                      ) =>
                        `<a
                          href="#${x[1]}"
                          class="${
                            x[1] == r
                              ? "on"
                              : ""
                          }"
                        >
                          ${x[0]}
                        </a>`,
                    )
                    .join("")}

                </div>

              </div>
            `
            : `
              <a
                href="#${m[2]}"
                class="${
                  m[2] == r
                    ? "on"
                    : ""
                }"
              >
                <span>
                  ${m[1]} ${m[0]}
                </span>
              </a>
            `,
      ).join("");

      document
        .querySelectorAll(
          ".gh[data-group]",
        )
        .forEach((el) => {
          el.addEventListener(
            "click",
            () => {
              el.parentElement?.classList.toggle(
                "open",
              );
            },
          );
        });

      (
        P[r] ||
        (C[r]
          ? () => list(r)
          : P.dashboard)
      )();

      if (window.innerWidth < 900) {
        document.body.classList.remove(
          "nav",
        );
      }
    };

    const menuBtn =
      document.getElementById(
        "menuBtn",
      );

    menuBtn?.addEventListener(
      "click",
      () => {
        document.body.classList.toggle(
          "nav",
        );
      },
    );

    const avatarButton = document.getElementById("ua");
    const userMenuWrap = document.querySelector(".user-menu-wrap");
    const userMenu = document.getElementById("userMenu");
    avatarButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = userMenu?.classList.toggle("open") || false;
      avatarButton.setAttribute("aria-expanded", String(open));
    });
    // The button names the language it switches to.
    const languageButton = document.getElementById("langBtn");
    if (languageButton) {
      languageButton.textContent = currentLanguage() === "bn" ? "English" : "বাংলা";
      languageButton.addEventListener("click", () => switchLanguage(currentLanguage() === "bn" ? "en" : "bn"));
    }
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      if (unsaved && !confirm("Some changes have not reached the server yet. Logging out now will discard them. Log out anyway?")) return;
      stopSync();
      void clearOfflineShop(user.id)
        .then(() => hostingApi.logout())
        .catch((error) => console.error("Could not log out", error))
        .then(onLogout);
    });
    const bellButton = document.getElementById("bellBtn");
    const bellPanel = document.getElementById("bellPanel");
    const closeBell = () => {
      bellPanel?.classList.remove("open");
      bellButton?.setAttribute("aria-expanded", "false");
    };
    bellButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      updateBell();
      const open = bellPanel?.classList.toggle("open") || false;
      bellButton.setAttribute("aria-expanded", String(open));
    });
    // Choosing an entry goes to its list, so the panel has done its job.
    bellPanel?.addEventListener("click", closeBell);
    const closeUserMenu = (event: MouseEvent) => {
      if (userMenuWrap && !userMenuWrap.contains(event.target as Node)) {
        userMenu?.classList.remove("open");
        avatarButton?.setAttribute("aria-expanded", "false");
      }
      if (!bellPanel?.contains(event.target as Node)) closeBell();
    };
    document.addEventListener("click", closeUserMenu);

    const themeBtn =
      document.getElementById(
        "themeBtn",
      );

    themeBtn?.addEventListener(
      "click",
      () => {
        const r =
          document.documentElement;

        r.dataset.theme =
          r.dataset.theme === "dark"
            ? "light"
            : "dark";
      },
    );

    (
      window as any
    ).flt = flt;

    (
      window as any
    ).form = form;

    (
      window as any
    ).add = add;

    (
      window as any
    ).del = del;

    (
      window as any
    ).ret = ret;

    (
      window as any
    ).invoice = (id: number) => openInvoice(id);

    (
      window as any
    ).printInvoice = (id: number) => receiptDialog(id);

    (
      window as any
    ).showActionMenu = showActionMenu;

    (
      window as any
    ).editSale = editSale;

    (
      window as any
    ).pos = pos;

    (
      window as any
    ).pgrid = pgrid;

    (
      window as any
    ).setProductFilters = setProductFilters;

    (
      window as any
    ).showProductMenu = showProductMenu;

    (
      window as any
    ).editProduct = editProduct;

    (
      window as any
    ).exportProducts = exportProducts;

    (
      window as any
    ).printProducts = printProducts;

    (
      window as any
    ).addc = addc;

    (
      window as any
    ).draw = draw;

    (
      window as any
    ).calc = calc;

    (window as any).setCartPrice = setCartPrice;
    (window as any).setCartQty = setCartQty;
    (window as any).removeCartItem = removeCartItem;

    (
      window as any
    ).savePos = savePos;

    (
      window as any
    ).rtab = rtab;

    (
      window as any
    ).PT = PT;

    const onHash = () =>
      render();

    window.addEventListener(
      "hashchange",
      onHash,
    );

    if (window.innerWidth >= 900) {
      document.body.classList.add(
        "nav",
      );
    }

    hdr();

    render();

    // Reminds the owner to confirm the email address while the shop still works.
    if (isWorkspaceOwner && !subscription.emailVerified) {
      const bar = document.createElement("div");
      bar.style.cssText = "padding:8px 16px;background:#eff6ff;color:#1e40af;font-size:13px;font-weight:600;text-align:center";
      const text = document.createElement("span");
      text.textContent = `Please confirm your email: we sent a link to ${user.email}. `;
      const resend = document.createElement("button");
      resend.type = "button";
      resend.textContent = "Send again";
      resend.style.cssText = "border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0";
      resend.addEventListener("click", () => void resendVerification(text).then(() => resend.remove()));
      bar.append(text, resend);
      document.querySelector(".main")?.prepend(bar);
    }

    // Tells the owner how long is left while there is still time to pay.
    if (isWorkspaceOwner && (subscription.state === "trial" || (subscription.state === "active" && daysLeft(subscription) <= 7))) {
      const bar = document.createElement("a");
      bar.href = "#settings-subscription";
      bar.style.cssText = "display:block;padding:8px 16px;background:#fff4ed;color:#9a3412;font-size:13px;font-weight:600;text-align:center;text-decoration:none";
      bar.textContent = `${subscription.state === "trial" ? "Free trial" : "Subscription"}: ${daysLeft(subscription)} days left. Tap here to pay and keep your shop running.`;
      document.querySelector(".main")?.prepend(bar);
    }

    cleanup = () => {
      stopSync();
      window.removeEventListener(
        "hashchange",
        onHash,
      );
      document.removeEventListener("click", closeUserMenu);

      document.body.classList.remove(
        "nav",
      );
    };
    };
    void boot().catch((error: unknown) => {
      console.error("Could not start the shop app", error);
      if (disposed || !root) return;
      const message = error instanceof Error ? error.message : String(error);
      root.replaceChildren();
      const panel = document.createElement("section");
      panel.className = "card";
      panel.style.cssText = "margin:32px auto;max-width:720px;padding:20px;background:#fff;color:#141420;border:1px solid #e5e7eb;border-radius:10px;font:14px/1.5 system-ui, sans-serif";
      const heading = document.createElement("h2");
      heading.textContent = "The shop app could not finish loading.";
      const detail = document.createElement("p");
      detail.textContent = `Error: ${message}`;
      const help = document.createElement("p");
      help.textContent = "Please send this message to the shop administrator.";
      panel.append(heading, detail, help);
      root.append(panel);
    });
    return () => { disposed = true; cleanup?.(); };
  }, [user, onLogout]);

  return (
    <div
      ref={rootRef}
      style={{
        minHeight: "100vh",
      }}
    />
  );
}

import { useEffect, useRef } from "react";
import { ORIGINAL_APP } from "./appShell";
import { canEncode, code128Svg, fitModule } from "./barcode";
import { canScanWithCamera, startScanner } from "./cameraScanner";
import { contactHtml, loadContact } from "./contact";
import { canUseBluetooth, canUseSerial, connectBluetooth, connectSerial, drawLabel, tsplJob, type LabelSpec, type PrinterLink } from "./labelPrinter";
import { hostingApi, type HostingUser, type ShopBackup, type Subscription } from "./hostingApi";
import { currentLanguage, switchLanguage, translate } from "./i18n";
import { drawReceipt, escposJob, PAPER_DOTS, pictureCanvas, POWERED_BY, tsplReceiptJob, type Receipt } from "./receiptPrinter";
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

    // The date on this device's own clock; the plain ISO date is London's, which
    // stays on yesterday until six in the morning in Bangladesh.
    const today = () => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };

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
        attendance: [],
        services: [],
        serviceItems: [],
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
          // What a sale may not be saved without; each shop chooses.
          requirePhone: false,
          requireReceived: false,
          staffCanChangePrice: false,
          notifications: { lowStock: true, expiry: true, dueReminders: true, sales: true, purchases: true, expenses: true },
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

    // Product fields that only some kinds of shop use: [label, hint].
    const EXTRA_FIELDS: Record<string, [string, string]> = {
      size: ["Size", "EX: M, XL, 32"],
      color: ["Color", "EX: Black"],
      fabric: ["Fabric", "EX: Cotton"],
      material: ["Material", "EX: Leather"],
      genericName: ["Generic Name", "EX: Paracetamol"],
      strength: ["Strength", "EX: 500 mg"],
      batchNo: ["Batch No", "Enter batch number"],
      rack: ["Rack / Shelf", "EX: A-3"],
      model: ["Model", "Enter model"],
      warranty: ["Warranty", "EX: 1 year"],
      author: ["Author", "Enter author name"],
      publisher: ["Publisher", "Enter publisher name"],
    };

    // What each kind of shop fills in for a product. `show` lists the optional
    // built-in fields it uses, `extra` the fields from EXTRA_FIELDS; the units
    // and categories are added to the shop's lists when the kind is chosen.
    const BUSINESS_TYPES: Record<string, { label: string; show: string[]; extra: string[]; units: string[]; categories: string[] }> = {
      general: { label: "General Store", show: ["brand", "lowAlert", "wholesale", "dealer", "manufacturer", "manufactureDate", "expireDate", "serial"], extra: [], units: [], categories: [] },
      sticker: { label: "Sticker & Wash Shop", show: ["brand", "lowAlert", "wholesale"], extra: [], units: ["Feet", "Inch", "Sq Ft"], categories: ["Bike Sticker", "Car Sticker", "Helmet Sticker", "Vinyl Roll", "Accessories"] },
      shoes: { label: "Shoe Shop", show: ["brand", "lowAlert", "wholesale", "sizeStock"], extra: ["color", "material"], units: ["Pair", "Box"], categories: ["Men's Shoe", "Women's Shoe", "Kids Shoe", "Sandal", "Sneaker", "Slipper", "Formal Shoe", "Boot", "Socks"] },
      clothing: { label: "Clothing Shop", show: ["brand", "lowAlert", "wholesale", "sizeStock"], extra: ["color", "fabric"], units: ["Dozen", "Yard", "Meter"], categories: ["Shirt", "Pant", "Panjabi", "Saree", "Three Piece", "Kids Wear"] },
      grocery: { label: "Grocery Shop", show: ["brand", "lowAlert", "wholesale", "dealer", "expireDate"], extra: [], units: ["Gram", "Liter", "Ml", "Dozen", "Hali", "Packet", "Bag", "Carton"], categories: ["Rice", "Lentils", "Flour", "Oil", "Spices", "Sugar & Salt", "Eggs", "Milk & Dairy", "Tea & Coffee", "Biscuits", "Snacks", "Beverages", "Soap & Detergent", "Baby Food"] },
      pharmacy: { label: "Pharmacy", show: ["brand", "lowAlert", "manufacturer", "manufactureDate", "expireDate"], extra: ["genericName", "strength", "batchNo", "rack"], units: ["Strip", "Bottle", "Tube", "Vial"], categories: ["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops"] },
      restaurant: { label: "Restaurant", show: [], extra: [], units: ["Plate", "Cup", "Glass", "Bottle"], categories: ["Rice Items", "Curry", "Fast Food", "Snacks", "Drinks", "Dessert"] },
      electronics: { label: "Mobile & Electronics", show: ["brand", "lowAlert", "wholesale", "dealer", "serial"], extra: ["model", "warranty"], units: [], categories: ["Mobile", "Accessories", "Laptop", "TV", "Home Appliance"] },
      cosmetics: { label: "Cosmetics Shop", show: ["brand", "lowAlert", "wholesale", "manufacturer", "manufactureDate", "expireDate"], extra: ["batchNo"], units: ["Bottle", "Tube", "Packet"], categories: ["Skin Care", "Hair Care", "Makeup", "Perfume"] },
      hardware: { label: "Hardware Shop", show: ["brand", "lowAlert", "wholesale", "dealer"], extra: ["size"], units: ["Feet", "Meter", "Liter", "Bag", "Dozen"], categories: ["Paint", "Pipe & Fittings", "Electrical", "Tools", "Cement"] },
      stationery: { label: "Books & Stationery", show: ["brand", "lowAlert", "wholesale"], extra: ["author", "publisher"], units: ["Dozen", "Packet", "Ream"], categories: ["Books", "Notebooks", "Pens", "Paper", "School Supplies"] },
    };
    const businessType = () => BUSINESS_TYPES[D.settings.businessType] || BUSINESS_TYPES.general;

    // What a shop sells besides its goods depends on the business: a tailor stitches, a mobile
    // shop repairs, a pharmacy checks blood pressure. The service screens take their name and
    // the ready-made list of services from the shop's business type.
    type ServiceGroup = [category: string, services: [name: string, price: number][]];
    const SERVICE_KINDS: Record<string, { label: string; starter: ServiceGroup[] }> = {
      general: { label: "Service Sale", starter: [
        ["Service", [["Home Delivery", 60], ["Installation", 300], ["Repair", 200], ["Fitting Charge", 100], ["Packing Charge", 20], ["Gift Wrapping", 50], ["Service Charge", 50]]],
      ] },
      sticker: { label: "Sticker & Wash", starter: [
        ["Sticker", [["Bike Full Sticker", 1500], ["Bike Half Sticker", 800], ["Bike Tank Sticker", 300], ["Bike Name Sticker", 150], ["Number Plate Sticker", 200], ["Helmet Sticker", 150], ["Bike Reflective Sticker", 250], ["Car Full Wrap", 15000], ["Car Side Sticker", 1200], ["Car Name Sticker", 300], ["Windshield Sticker", 400], ["Laptop Skin", 350], ["Mobile Skin", 200], ["Custom Name Sticker", 100], ["Sticker Remove", 300]]],
        ["Wash", [["Bike Wash", 150], ["Bike Foam Wash", 250], ["Bike Polish", 300], ["Bike Full Wash & Polish", 400], ["Car Wash", 500], ["Car Foam Wash", 800], ["Car Interior Cleaning", 1000], ["Car Polish", 1500], ["Engine Wash", 300]]],
        ["Other", [["Chain Lubrication", 100], ["Number Plate Fitting", 200], ["Lamination", 50], ["Fitting Charge", 100], ["Delivery Charge", 60]]],
      ] },
      shoes: { label: "Shoe Repair", starter: [
        ["Repair", [["Sole Change", 300], ["Heel Repair", 150], ["Stitching", 100], ["Gluing", 60], ["Zipper Repair", 150], ["Size Stretching", 100]]],
        ["Care", [["Shoe Polish", 50], ["Shoe Wash", 150], ["Lace Change", 30], ["Insole Change", 80]]],
      ] },
      clothing: { label: "Tailoring", starter: [
        ["Stitching", [["Shirt Stitching", 450], ["Pant Stitching", 450], ["Panjabi Stitching", 650], ["Blouse Stitching", 350], ["Three Piece Stitching", 600], ["Salwar Kameez Stitching", 550], ["Kids Dress Stitching", 300]]],
        ["Alteration", [["Alteration", 100], ["Length Cut", 60], ["Fall & Pico", 80], ["Button Change", 30], ["Zipper Change", 60], ["Embroidery", 300], ["Ironing", 20]]],
      ] },
      grocery: { label: "Delivery & Service", starter: [
        ["Delivery", [["Home Delivery", 50], ["Express Delivery", 100], ["Bulk Delivery", 200], ["Gas Cylinder Delivery", 100]]],
        ["Other", [["Packing Charge", 20], ["Gift Packing", 50], ["Spice Grinding", 30], ["Rice Cleaning", 20]]],
      ] },
      pharmacy: { label: "Health Service", starter: [
        ["Check-up", [["Blood Pressure Check", 20], ["Sugar Test", 50], ["Weight Check", 10], ["Doctor Consultation", 300]]],
        ["Care", [["Injection Push", 30], ["Saline Push", 100], ["Nebulizer", 50], ["Dressing", 100], ["Home Delivery", 50]]],
      ] },
      restaurant: { label: "Catering & Event", starter: [
        ["Catering", [["Catering (per person)", 350], ["Party Hall Rent", 3000], ["Birthday Decoration", 2000], ["Event Service Charge", 1000]]],
        ["Delivery", [["Home Delivery", 50], ["Parcel Packing", 20], ["Service Charge", 50]]],
      ] },
      electronics: { label: "Repair Service", starter: [
        ["Mobile", [["Screen Change", 1500], ["Battery Change", 800], ["Charging Port Repair", 400], ["Software Flash", 300], ["Water Damage Repair", 600], ["Speaker Repair", 300], ["Screen Protector Fitting", 50]]],
        ["Computer & TV", [["Laptop Servicing", 800], ["Windows Installation", 300], ["Data Recovery", 500], ["TV Repair", 1000], ["Home Service Visit", 300]]],
      ] },
      cosmetics: { label: "Beauty Service", starter: [
        ["Hair", [["Hair Cut", 300], ["Hair Spa", 1000], ["Hair Color", 1500], ["Hair Treatment", 2000]]],
        ["Skin & Makeup", [["Facial", 800], ["Threading", 50], ["Waxing", 600], ["Manicure", 400], ["Pedicure", 500], ["Party Makeup", 2000], ["Bridal Makeup", 8000], ["Mehendi", 500]]],
      ] },
      hardware: { label: "Fitting & Repair", starter: [
        ["Fitting", [["Pipe Fitting", 300], ["Tap Change", 150], ["Fan Fitting", 200], ["Light Fitting", 100], ["Lock Fitting", 200], ["Tile Fitting (per sq ft)", 40]]],
        ["Work", [["Electric Wiring", 500], ["Paint Labour (per sq ft)", 15], ["Welding", 300], ["Home Delivery", 100]]],
      ] },
      stationery: { label: "Print & Photocopy", starter: [
        ["Print", [["Photocopy", 2], ["Color Photocopy", 10], ["Print (B/W)", 5], ["Color Print", 15], ["Scan", 10]]],
        ["Other", [["Lamination", 30], ["Spiral Binding", 40], ["Passport Size Photo", 100], ["Typing (per page)", 30], ["Online Application", 100]]],
      ] },
    };
    const serviceKind = () => SERVICE_KINDS[D.settings.businessType] || SERVICE_KINDS.general;
    const serviceLabel = () => serviceKind().label;
    const menuLabel = (name: string) => (name === "Service Sale" ? serviceLabel() : name);
    const serviceCost = (entry: any) => sum(entry.items || [], (item) => (+item.cost || 0) * (+item.qty || 0));
    // The extra details a product has, for showing beside its name.
    const productDetails = (product: any) => [sizeSummary(product), ...Object.keys(EXTRA_FIELDS).map((id) => String(product[id] || "").trim())].filter(Boolean).join(" · ");

    // A product is low when its stock is at or under its own alert quantity
    // (10 when none was set). The dashboard, the bell and the sale message all use this.
    const alertQty = (product: any) => (+product.lowAlert > 0 ? +product.lowAlert : 10);
    const isLowStock = (product: any) => (+product.stock || 0) <= alertQty(product);
    const lowStockProducts = () => D.products.filter(isLowStock);
    // The time an invoice was made. Invoices from before the time was kept still tell it:
    // a record's id is built from the clock at the moment it was created.
    const invoiceTime = (entry: any) => {
      if (entry.time) return String(entry.time);
      const made = Math.floor(+entry.id / 1000);
      if (!(made > Date.UTC(2020, 0, 1) && made < Date.now() + 864e5)) return "";
      return new Date(made).toTimeString().slice(0, 5);
    };
    // "14:05" as it is said: "2:05 PM".
    const clock12 = (time: string) => {
      const [hours, minutes] = String(time).split(":").map(Number);
      return Number.isFinite(hours) && Number.isFinite(minutes) ? `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}` : String(time);
    };
    // Quantities can be fractions (half a kg), kept to three decimal places.
    const q3 = (amount: number) => Math.round((+amount || 0) * 1000) / 1000;

    // A product kept by size (clothing) holds its stock per size, and its own stock is their total.
    const sizeList = (product: any): { size: string; qty: number }[] => (Array.isArray(product?.sizes) ? product.sizes : []);
    const sizeQty = (product: any, size: string) => +(sizeList(product).find((row) => row.size === size)?.qty || 0);
    const sizeSummary = (product: any) => sizeList(product).map((row) => `${row.size}: ${+row.qty || 0}`).join(" · ");
    // Adds to a product's stock (or takes from it, with a negative amount), in the given size when it has one.
    const moveStock = (product: any, amount: number, size = "") => {
      if (size && sizeList(product).length) {
        const rows = sizeList(product).map((row) => ({ ...row }));
        const row = rows.find((entry) => entry.size === size);
        if (row) row.qty = q3(+row.qty + amount);
        else rows.push({ size, qty: q3(amount) });
        product.sizes = rows;
        product.stock = q3(sum(rows, (entry) => +entry.qty || 0));
      } else {
        product.stock = q3((+product.stock || 0) + amount);
      }
    };

    // Products still in stock whose expire date has passed or comes within 30 days.
    const expiringProducts = () => {
      const limit = new Date(today());
      limit.setUTCDate(limit.getUTCDate() + 30);
      const last = limit.toISOString().slice(0, 10);
      return D.products
        .filter((product: any) => product.expireDate && +product.stock > 0 && product.expireDate <= last)
        .sort((a: any, b: any) => String(a.expireDate).localeCompare(String(b.expireDate)));
    };

    // The bell: what needs attention now, according to the alerts switched on in Settings.
    const updateBell = () => {
      const button = $("#bellBtn");
      const panel = $("#bellPanel");
      if (!button || !panel) return;
      const low = D.settings.notifications.lowStock ? lowStockProducts() : [];
      const dues = D.settings.notifications.dueReminders ? D.sales.filter((sale: any) => +sale.due > 0 && !sale.ret) : [];
      const expiring = D.settings.notifications.expiry ? expiringProducts() : [];
      const count = low.length + dues.length + expiring.length;
      $("#bellCount").textContent = String(count);
      button.classList.toggle("has-alerts", count > 0);
      const shown = 30;
      panel.innerHTML = count === 0
        ? "<p>Nothing needs your attention.</p>"
        : (low.length ? `<h4>Low Stock (${low.length})</h4>${low.slice(0, shown).map((product: any) => `<a href="#stocks"><span>${esc(product.name)}</span><small>${(+product.stock || 0) <= 0 ? "Out of stock" : `Stock ${+product.stock}`} · Alert Qty ${alertQty(product)}</small></a>`).join("")}` : "")
          + (expiring.length ? `<h4>Expiring Soon (${expiring.length})</h4>${expiring.slice(0, shown).map((product: any) => `<a href="#products"><span>${esc(product.name)}</span><small>${product.expireDate < today() ? "Expired" : "Expires"} ${esc(product.expireDate)} · Stock ${+product.stock}</small></a>`).join("")}` : "")
          + (dues.length ? `<h4>Customer Due (${dues.length})</h4>${dues.slice(0, shown).map((sale: any) => `<a href="#dues"><span>${esc(sale.party || "Customer")}</span><small>${esc(sale.inv)} · ${tk(sale.due)}</small></a>`).join("")}` : "");
    };

    // A computer with a keyboard and mouse, as against a phone or tablet.
    const KEYBOARD_DEVICE = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
    // Whether the Sale screen's camera scanner was left switched on, on this device.
    const CAMERA_SCAN_SAVED = "hishabpos_camera_scan";

    const toast = (t: string) => {
      const e = $("#toast");
      if (!e) return;

      e.textContent = t;
      e.style.display = "block";

      clearTimeout(e.t);

      e.t = setTimeout(() => {
        e.style.display = "none";
      }, Math.max(2200, t.length * 55));
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

    // Only the owner changes or deletes what is saved. Staff sell, take payments and add new
    // records; the buttons for the rest are hidden from them, and refused here as well.
    const ownerOnly = () => {
      if (isWorkspaceOwner) return true;
      toast("Only the shop owner can edit or delete this");
      return false;
    };
    // Staff sell at the listed prices unless the owner lets them change prices and give discounts.
    const priceLocked = () => !isWorkspaceOwner && !D.settings.staffCanChangePrice;
    const lockAttr = () => (priceLocked() ? 'readonly title="Only the shop owner can change this"' : "");

    const del = (k: string, id: number) => {
      if (!ownerOnly()) return;
      if (confirm("Delete this record?")) {
        const record = D[k].find((x: any) => x.id === id);
        const productImagePath = k === "products" ? (record?.imagePath || record?.image) : "";
        if (record?.items && !record.ret) {
          record.items.forEach((item: any) => {
            const product = prod(item.id);
            if (!product) return;
            if (k === "sales") moveStock(product, +item.qty || 0, item.size);
            if (k === "purchases") moveStock(product, -(+item.qty || 0), item.size);
          });
        }
        D[k] = D[k].filter((x: any) => x.id !== id);

        if (productImagePath) void removeProductImage(productImagePath).catch((error) => console.warn("Could not delete product image", error));

        save();

        render();
      }
    };

    const ret = (k: string, id: number) => {
      if (!ownerOnly()) return;
      const s = D[k].find((x: any) => x.id == id);

      if (!s) return;

      s.ret = 1;

      s.items?.forEach((i: any) => {
        const p = prod(i.id);

        if (p) {
          moveStock(p, k === "sales" ? i.qty : -i.qty, i.size);
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
      if (!ownerOnly()) return;
      const sale = D.sales.find((item: any) => item.id == id);
      if (!sale) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `
        <h3>Edit Invoice ${esc(sale.inv)}</h3>
        <label>Date</label><input id="editSaleDate" type="date" value="${esc(sale.date)}">
        <label>Party Name</label><input id="editSaleParty" value="${esc(sale.party)}">
        <label>Discount (৳)</label><input id="editSaleDiscount" type="number" min="0" step="0.01" value="${+sale.disc || 0}">
        <label>Paid Amount (৳)</label><input id="editSalePaid" type="number" min="0" step="0.01" value="${+sale.paid || 0}">
        <label>Payment Type</label><select id="editSalePayment">${["Cash", "bKash", "Nagad", "Card"].map((type) => `<option value="${type}" ${sale.pay === type ? "selected" : ""}>${type}</option>`).join("")}</select>
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
    // Which of a product's prices the sale being made uses: sell (retail), wholesale or dealer.
    let PRICE_LEVEL = "sell";
    const salePrice = (product: any) => (+product[PRICE_LEVEL] > 0 ? +product[PRICE_LEVEL] : +product.sell || 0);
    let PRODUCT_CATEGORY = "";
    let PRODUCT_BRAND = "";

    const pos = (t: string) => {
      PT = t;

      CART = [];
      PRICE_LEVEL = "sell";

      const s = t === "sale";
      const priceLevels = [["sell", "Retail Price"], ["wholesale", "Wholesale Price"], ["dealer", "Dealer Price"]]
        .filter(([level]) => level === "sell" || businessType().show.includes(level));

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
                <input id="walkPhone" type="tel" inputmode="tel" placeholder="Walk-in phone number" ${D.settings.requirePhone ? "required" : ""}>
              </div>
            ` : ""}

            ${s && priceLevels.length > 1 ? `<label for="priceLevel">Price for this sale</label><select id="priceLevel" onchange="setPriceLevel(this.value)">${priceLevels.map(([level, label]) => `<option value="${level}">${label}</option>`).join("")}</select>` : ""}

            ${s ? `<div class="serial-scan"><label for="serialScan">Scan a barcode, or type a product name, code or serial number, then press Enter</label><div style="display:flex;gap:8px"><input id="serialScan" autocomplete="off" placeholder="Barcode, product code or serial number" style="flex:1;min-width:0">${canScanWithCamera() ? `<button class="btn pu" id="scanCamera" type="button" aria-label="Scan with the camera" title="Scan with the camera" style="flex:0 0 auto;padding:0 14px"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/></svg></button>` : ""}</div><div id="scanSuggest"></div>${KEYBOARD_DEVICE ? `<p class="scan-keys">F1 Phone number · F2 Product box · ↑ ↓ Choose · Enter Add · + − Quantity · Del Remove · F4 Receive amount · F9 Save</p>` : ""}<div id="scanPanel"></div></div>` : ""}

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
                  value="${s && D.settings.requireReceived ? "" : "0"}"
                  ${s && D.settings.requireReceived ? "required" : ""}
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
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Card">Card</option>
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
                    ${lockAttr()}
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
        linkCustomerPhone($("#walkPhone"), $("#walkName"));
        // The camera sits on the page and stays on, so products are added one after
        // another just by holding it over their barcodes. Once switched on it comes
        // on by itself each time this screen opens, until it is closed.
        const scanPanel = $("#scanPanel");
        const remembered = () => { try { return localStorage.getItem(CAMERA_SCAN_SAVED) === "on"; } catch { return false; } };
        const remember = (on: boolean) => { try { localStorage.setItem(CAMERA_SCAN_SAVED, on ? "on" : "off"); } catch { /* it then has to be switched on each visit */ } };
        let stopCamera: (() => void) | null = null;
        const startCamera = () => {
          stopCamera = startScanner(scanPanel, (code) => {
            const message = $("#toast");
            if (message) message.style.display = "none";
            const count = () => CART.reduce((sum, item) => sum + item.qty, 0);
            const before = count();
            const added = addSerialFromScan(code);
            // The scan box takes the focus after a scan, which would bring up the phone's keyboard.
            (document.activeElement as HTMLElement | null)?.blur();
            if (added && count() > before) return `Added: ${added.name} × ${CART.find((item) => item.id === added.id)?.qty || 1}`;
            return message && message.style.display === "block" ? message.textContent || "" : "";
          }, () => { stopCamera = null; remember(false); });
        };
        $("#scanCamera")?.addEventListener("click", () => {
          if (stopCamera) { stopCamera(); stopCamera = null; remember(false); return; }
          remember(true);
          startCamera();
        });
        if (scanPanel && $("#scanCamera") && remembered()) startCamera();
        // The whole sale can be made from the keyboard: type part of a name or code,
        // pick with the arrow keys, Enter to add. A scanner types a full code and
        // Enter, which adds that product at once.
        const serialScan = $("#serialScan");
        const suggest = $("#scanSuggest");
        let choices: any[] = [];
        let chosen = 0;
        const showChoices = () => {
          const query = serialScan.value.trim().toLowerCase();
          choices = query ? D.products.filter((p: any) => `${p.name} ${p.code || ""}`.toLowerCase().includes(query)).slice(0, 8) : [];
          chosen = Math.max(0, Math.min(chosen, choices.length - 1));
          suggest.innerHTML = choices.map((p: any, index: number) => `<button type="button" tabindex="-1" data-no-translate data-choice="${index}" class="scan-choice${index === chosen ? " on" : ""}"><span>${esc(p.name)}</span><small>${esc(p.code || "")} · ${tk(p.sell)} · ${+p.stock || 0}</small></button>`).join("");
        };
        const clearScan = () => { serialScan.value = ""; chosen = 0; showChoices(); };
        const takeChoice = (product: any) => {
          if (+product.stock <= 0) { toast("This product is out of stock"); return; }
          addc(product.id);
          clearScan();
          serialScan.focus();
        };
        serialScan?.addEventListener("input", () => { chosen = 0; showChoices(); });
        // mousedown, so the box does not lose the keyboard before the product is added.
        suggest?.addEventListener("mousedown", (event: MouseEvent) => {
          const button = (event.target as HTMLElement).closest<HTMLElement>("[data-choice]");
          if (!button) return;
          event.preventDefault();
          takeChoice(choices[+button.dataset.choice!]);
        });
        serialScan?.addEventListener("keydown", (event: KeyboardEvent) => {
          const value = serialScan.value.trim();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!choices.length) return;
            event.preventDefault();
            chosen = (chosen + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length;
            showChoices();
          } else if (event.key === "Escape") {
            if (value) { event.preventDefault(); clearScan(); }
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (!value) return;
            const typed = value.toLowerCase();
            const exact = D.products.some((p: any) => p.hasSerial
              ? (p.serials || []).some((serial: string) => serial.toLowerCase() === typed)
              : String(p.code || "").trim().toLowerCase() === typed);
            if (exact || !choices.length) {
              addSerialFromScan(value);
              if (!serialScan.value) clearScan();
            } else {
              takeChoice(choices[chosen]);
            }
          } else if (!value && CART.length && ["+", "=", "-", "Delete"].includes(event.key)) {
            // With the box empty these keys work on the product added last.
            event.preventDefault();
            const last = CART[CART.length - 1];
            if (event.key === "Delete") { removeCartItem(CART.length - 1); return; }
            if (prod(last.id)?.hasSerial) { toast("Add one unit by selecting the product and entering its serial number"); return; }
            last.qty = Math.max(1, last.qty + (event.key === "-" ? -1 : 1));
            draw();
          }
        });
        $("#rc")?.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          savePos();
        });
        // On a computer the box is ready for typing as soon as the screen opens; on a
        // phone that would bring the keyboard up over the page.
        if (KEYBOARD_DEVICE) serialScan?.focus();
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
            ${sizeList(p).length ? `<small data-no-translate>${esc(sizeSummary(p))}</small>` : ""}
          </span>
        </button>`).join("") || "<div class='mut'>No product found</div>";
    };

    const setProductFilters = () => {
      PRODUCT_CATEGORY = $("#productCategoryFilter")?.value || "";
      PRODUCT_BRAND = $("#productBrandFilter")?.value || "";
      pgrid($("#productSearch")?.value || "");
    };
    // Asks which size is wanted, then adds that size to the cart.
    const chooseSize = (product: any) => {
      const dialog = $("#dlg") as HTMLDialogElement;
      const selling = PT === "sale";
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>Choose a size</h3>
        <p class="settings-help" data-no-translate>${esc(product.name)}</p>
        <div class="size-pick">${sizeList(product).map((row, index) => `<button type="button" data-size="${index}" ${selling && !(+row.qty > 0) ? "disabled" : ""}><b data-no-translate>${esc(row.size)}</b><small>Stock ${+row.qty || 0}</small></button>`).join("")}</div>
        <div class="two" style="margin-top:16px"><button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button><span></span></div>
      </div>`;
      dialog.showModal();
      dialog.querySelectorAll("[data-size]").forEach((button) => button.addEventListener("click", () => {
        dialog.close();
        addc(product.id, undefined, sizeList(product)[+(button as HTMLElement).dataset.size!].size);
      }));
    };

    const addc = (id: number, enteredSerial?: string, size = "") => {
      const p = prod(id);

      if (!p) return;

      if (sizeList(p).length && !size) {
        if (PT === "sale" && +p.stock <= 0) { toast("This product is out of stock"); return; }
        chooseSize(p);
        return;
      }

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

      const c = CART.find((x) => x.id === id && (x.size || "") === size);

      if (c) {
        c.qty++;
        if (serial) c.serials.push(serial);
      } else {
        CART.push({
          id,
          size,
          qty: 1,
          price: PT === "sale" ? salePrice(p) : p.buy,
          serials: serial ? [serial] : [],
        });
      }

      draw();
    };

    // Returns the product it tried to add, or nothing when the code matched none.
    const addSerialFromScan = (serial: string): any => {
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
          return undefined;
        }
        addc(codeMatch.id);
      }
      const input = $("#serialScan");
      if (input) {
        input.value = "";
        input.focus();
      }
      return matchedProduct || D.products.find((p: any) => !p.hasSerial && +p.stock > 0 && String(p.code || "").trim().toLowerCase() === serial.toLowerCase());
    };

    const setCartPrice = (index: number, value: string) => {
      if (priceLocked()) return;
      if (!CART[index]) return;
      CART[index].price = +value || 0;
      calc();
    };

    const setCartQty = (index: number, value: string) => {
      const item = CART[index];
      if (!item) return;
      item.qty = prod(item.id)?.hasSerial && PT === "sale"
        ? item.serials.length
        : (+value > 0 ? q3(+value) : 1);
      calc();
    };

    // Switching between retail, wholesale and dealer reprices what is already in the cart.
    const setPriceLevel = (level: string) => {
      PRICE_LEVEL = level;
      CART.forEach((item) => { const product = prod(item.id); if (product) item.price = salePrice(product); });
      draw();
    };

    // "20 taka of sugar": works out the quantity from the money the customer wants to spend.
    const setCartAmount = (index: number) => {
      const item = CART[index];
      if (!item || !(item.price > 0)) return;
      const entered = window.prompt(said("How much money's worth?"));
      const amount = +(entered || 0);
      if (!(amount > 0)) return;
      item.qty = Math.max(0.001, q3(amount / item.price));
      draw();
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
                ${esc(prod(c.id)?.name)}${c.size ? ` <span class="lx-pill" style="--c:var(--pu)" data-no-translate>${esc(c.size)}</span>` : ""}
              </td>

              <td>${c.serials?.length ? c.serials.map((value: string) => esc(value)).join(", ") : "-"}</td>

              <td>
                <input
                  type="number"
                  style="width:80px"
                  value="${c.price}"
                  ${lockAttr()}
                  oninput="setCartPrice(${i},this.value)"
                >
              </td>

              <td>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  style="width:64px"
                  value="${c.qty}"
                  ${PT === "sale" && prod(c.id)?.hasSerial ? "readonly title=\"Add one unit by selecting the product and entering its serial number\"" : ""}
                  oninput="setCartQty(${i},this.value)"
                >
                ${PT === "sale" && D.settings.businessType === "grocery" && !prod(c.id)?.hasSerial ? `<button class="mini" type="button" title="Sell by amount" aria-label="Sell by amount" onclick="setCartAmount(${i})">${esc(CURRENCY_SYMBOL)}</button>` : ""}
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

      // Where the shop has asked for it in General Settings, a sale needs the buyer's
      // phone number (unless a saved customer is chosen) and the amount received,
      // typed in; 0 is typed for a sale wholly on credit.
      if (s) {
        const missing = (id: string, message: string) => {
          const field = $("#" + id);
          const empty = field && !field.value.trim();
          if (field) field.style.borderColor = empty ? "#dc2626" : "";
          if (!empty) return false;
          toast(message);
          field.focus();
          return true;
        };
        if (D.settings.requirePhone && !$("#pp").value && missing("walkPhone", "Enter the customer's phone number")) return;
        if (D.settings.requireReceived && missing("rc", "Enter the amount received (0 if nothing was paid)")) return;
      }

      const T = calc();

      if (
        s &&
        CART.some(
          (c) =>
            c.qty >
            (c.size ? sizeQty(prod(c.id), c.size) : prod(c.id)?.stock || 0),
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
          moveStock(pr, -c.qty, c.size);
          if (pr.hasSerial && c.serials?.length) {
            const soldSerials = new Set(c.serials.map((value: string) => value.toLowerCase()));
            pr.serials = (pr.serials || []).filter((value: string) => !soldSerials.has(value.toLowerCase()));
          }
        } else {
          moveStock(pr, c.qty, c.size);
          pr.buy = c.price;
        }
      });

      let pid = $("#pp").value;

      // A buyer whose name or phone was typed is kept as a customer, so the next
      // sale, their dues and their history all find them. The phone number says
      // who they are; without one the name does.
      const typedName = s && !pid ? $("#walkName")?.value.trim() || "" : "";
      const typedPhone = s && !pid ? $("#walkPhone")?.value.trim() || "" : "";
      if (typedName || typedPhone) {
        const known = D.customers.find((person: any) => typedPhone
          ? phoneKey(person.phone) === phoneKey(typedPhone)
          : !person.phone && String(person.name || "").trim().toLowerCase() === typedName.toLowerCase());
        if (known) {
          pid = String(known.id);
        } else {
          const customer = { id: uid(), status: "Active", name: typedName || typedPhone, phone: typedPhone, address: "" };
          D.customers.push(customer);
          pid = String(customer.id);
        }
      }

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
        // When it was entered, for the invoice and receipt.
        time: nowTime(),

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

        // Which saved customer or supplier this is for; 0 for a walk-in.
        partyId: +pid || 0,

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
          name: (prod(c.id)?.name || "Product") + (c.size ? ` (${c.size})` : ""),
          size: c.size || "",
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

    // The "stock by size" box: a quantity for each size, with the total written into the stock field.
    // The sizes offered depend on what is being sold: trousers go by waist, children's clothes by age.
    // The category's name decides, in English or Bangla; anything else gets the letter sizes.
    const SIZE_SETS: [RegExp, string[]][] = [
      [/(kid|baby|child|boys|girls|বাচ্চা|শিশু).*(shoe|sandal|slipper|sneaker|boot|জুতা|স্যান্ডেল|চপ্পল)|(shoe|sandal|slipper|sneaker|boot|জুতা|স্যান্ডেল|চপ্পল).*(kid|baby|child|বাচ্চা|শিশু)/i, ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35"]],
      [/(women|ladies|lady|মহিলা|লেডিস|মেয়েদের).*(shoe|sandal|slipper|sneaker|boot|heel|জুতা|স্যান্ডেল|চপ্পল)|(shoe|sandal|slipper|sneaker|boot|heel|জুতা|স্যান্ডেল|চপ্পল).*(women|ladies|lady|মহিলা|লেডিস)/i, ["35", "36", "37", "38", "39", "40", "41"]],
      [/socks|মোজা/i, ["Free Size"]],
      [/kid|baby|child|boys|girls|বাচ্চা|শিশু/i, ["1-2Y", "3-4Y", "5-6Y", "7-8Y", "9-10Y", "11-12Y"]],
      [/pant|jeans|trouser|gabardine|প্যান্ট|জিন্স/i, ["28", "30", "32", "34", "36", "38", "40"]],
      [/shoe|sandal|slipper|sneaker|boot|loafer|জুতা|স্যান্ডেল|চপ্পল|বুট|স্নিকার|লোফার|কেডস/i, ["38", "39", "40", "41", "42", "43", "44", "45"]],
      [/panjabi|punjabi|পাঞ্জাবি/i, ["38", "40", "42", "44", "46"]],
      [/saree|sari|lungi|orna|শাড়ি|লুঙ্গি|ওড়না/i, ["Free Size"]],
    ];
    // A category the list does not know gets the shop's usual sizes: shoe numbers in a shoe shop,
    // letter sizes anywhere else.
    const sizesFor = (categoryName: string) => SIZE_SETS.find(([names]) => names.test(categoryName))?.[1]
      || (D.settings.businessType === "shoes" ? ["38", "39", "40", "41", "42", "43", "44", "45"] : ["S", "M", "L", "XL", "XXL"]);
    const sizeEditorHtml = () => `
      <div class="size-stock" id="sizeStock">
        <div class="size-stock-head"><b>Stock by Size</b><span class="size-chips" id="sizeChips"></span></div>
        <div class="size-rows" id="sizeRows"></div>
        <small class="size-stock-note">Leave this empty for a product that has no sizes.</small>
      </div>`;
    // Wires the box up and returns a function that reads the sizes back.
    const sizeEditor = (initial: { size: string; qty: number }[], stockInput: HTMLInputElement, category: HTMLSelectElement | null) => {
      let rows = initial.map((row) => ({ size: row.size, qty: +row.qty || 0 }));
      const box = $("#sizeRows");
      const showTotal = () => {
        stockInput.readOnly = rows.length > 0;
        if (rows.length) stockInput.value = String(q3(sum(rows, (row) => row.qty)));
      };
      const drawSizes = () => {
        box.innerHTML = rows.map((row, index) => `<label class="size-row"><span data-no-translate>${esc(row.size)}</span><input type="number" min="0" step="any" inputmode="decimal" value="${row.qty}" data-row="${index}" aria-label="${esc(row.size)}"><button type="button" data-remove="${index}" title="Remove" aria-label="Remove">✕</button></label>`).join("");
        showTotal();
      };
      box.addEventListener("input", (event: Event) => {
        const input = event.target as HTMLInputElement;
        if (input.dataset.row === undefined) return;
        rows[+input.dataset.row].qty = Math.max(0, +input.value || 0);
        showTotal();
      });
      box.addEventListener("click", (event: Event) => {
        const remove = ((event.target as HTMLElement).closest("[data-remove]") as HTMLElement | null)?.dataset.remove;
        if (remove === undefined) return;
        event.preventDefault();
        rows.splice(+remove, 1);
        drawSizes();
      });
      // The buttons follow the category chosen above them.
      const drawChips = () => {
        // The saved name as well as the one on screen, which may be in Bangla.
        const presets = sizesFor(`${category?.value ? nm("categories", category.value) : ""} ${category?.selectedOptions[0]?.textContent || ""}`);
        $("#sizeChips").innerHTML = presets.map((size) => `<button type="button" data-add-size="${esc(size)}" data-no-translate>${esc(size)}</button>`).join("") + `<button type="button" data-add-size="">+ Other size</button>`;
      };
      category?.addEventListener("change", drawChips);
      drawChips();
      $("#sizeChips").addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("[data-add-size]") as HTMLElement | null;
        if (!button) return;
        const size = (button.dataset.addSize || window.prompt(said("Size name (EX: 32, 2-3Y)")) || "").trim();
        if (!size) return;
        if (rows.some((row) => row.size.toLowerCase() === size.toLowerCase())) { toast("This size is already added"); return; }
        rows.push({ size, qty: 0 });
        drawSizes();
        (box.querySelector(`[data-row="${rows.length - 1}"]`) as HTMLInputElement | null)?.select();
      });
      drawSizes();
      return () => rows.map((row) => ({ size: row.size, qty: q3(row.qty) }));
    };

    const productForm = () => {
      const kind = businessType();
      const uses = (field: string) => kind.show.includes(field);
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
              ${uses("brand") ? selectField("brand", "Product Brand", D.brands) : ""}
              ${selectField("unit", "Product Unit", D.units)}
              ${textField("code", "Product Code", "Enter Product Code", "text", true)}
              ${kind.extra.map((id) => textField(id, EXTRA_FIELDS[id][0], EXTRA_FIELDS[id][1])).join("")}
              ${textField("stock", "Stock", "Enter stock qty", "number", true)}
              ${uses("sizeStock") ? sizeEditorHtml() : ""}
              ${uses("lowAlert") ? textField("lowAlert", "Low Stock Alert", "EX: 5", "number") : ""}
              ${textField("buy", "Purchase Price", "Enter purchase price", "number", true)}
              ${textField("mrp", "MRP Price", "Enter MRP price", "number", true)}
              ${uses("wholesale") ? textField("wholesale", "Wholesale Price", "Enter wholesale price", "number") : ""}
              ${uses("dealer") ? textField("dealer", "Dealer Price", "Enter dealer price", "number") : ""}
              ${uses("manufacturer") ? textField("manufacturer", "Manufacturer", "Enter manufacturer name") : ""}
              ${uses("manufactureDate") ? textField("manufactureDate", "Manufacture Date", "", "date") : ""}
              ${uses("expireDate") ? textField("expireDate", "Expire Date", "", "date") : ""}
              <label class="product-field"><span>Image (max ${MAX_IMAGE_FILE_KB} KB)</span><input id="p_image" type="file" accept="image/*"><img id="productImagePreview" class="product-image-preview" alt="Product image preview"></label>
              ${uses("serial") ? `<label class="product-field"><span>Has Serial</span><select id="p_hasSerial"><option>No</option><option>Yes</option></select></label>
              <label class="product-field serial-inventory-field" id="serialInventoryField" hidden><span>Available Serial Numbers</span><textarea id="p_serials" class="product-serial-input" placeholder="Enter one serial number per line, or separate with commas"></textarea></label>` : ""}
            </div>
            <div class="product-create-actions">
              <button class="btn or" type="reset">Reset</button>
              <button class="btn pu" type="submit">Save</button>
            </div>
          </form>
        </section>`;

      const readSizes = uses("sizeStock") ? sizeEditor([], $("#p_stock"), $("#p_category")) : () => [];
      // Reset empties the fields but not the size box, so start the form over.
      $("#productCreateForm")?.addEventListener("reset", () => window.setTimeout(productForm));

      const serialField = $("#serialInventoryField");
      const syncSerialField = () => { if (serialField) serialField.hidden = $("#p_hasSerial").value !== "Yes"; };
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
          brand: uses("brand") ? +value("brand") : D.brands[0]?.id || 0,
          unit: +value("unit"),
          ...Object.fromEntries(kind.extra.map((id) => [id, value(id)])),
          sizes: readSizes(),
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

    const findInvoice = (id: number) => D.sales.find((item: any) => item.id == id) || D.services.find((item: any) => item.id == id);
    const openInvoice = (id: number, compact = false, autoPrint = false) => {
      const sale = findInvoice(id);
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
          .amounts{max-width:340px;margin-left:auto}.grand{font-size:17px;font-weight:800}.thank{margin-top:18px;font-weight:700}.powered{margin-top:10px;color:#555;font-size:11px}
          @media print{body{background:#fff}.toolbar{display:none}.paper{width:${compact ? "58mm" : "100%"};margin:0;border:0;padding:${compact ? "4mm" : "0"}}}
        </style></head><body>
        <div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.print()">Save PDF</button></div>
        <main class="paper">
          <header class="center">${shopLogo}<div class="brand">${shopName}</div><div class="sub">${esc(D.user.phone || "")}</div><div class="sub">${esc(D.user.address || "")}</div><div class="sub">${sale.kind === "service" ? `${esc(serviceLabel())} Receipt` : "Money Receipt"}</div></header>
          <div class="rule"></div>
          <div class="row"><span>Invoice</span><b>${esc(sale.inv)}</b></div>
          <div class="row"><span>Date</span><span>${esc(sale.date)}</span></div>
          ${invoiceTime(sale) ? `<div class="row"><span>Time</span><span>${esc(clock12(invoiceTime(sale)))}</span></div>` : ""}
          <div class="row"><span>Customer</span><span>${esc(sale.party || "Walk-in Customer")}</span></div>
          ${sale.phone ? `<div class="row"><span>Mobile</span><span>${esc(sale.phone)}</span></div>` : ""}
          <div class="row"><span>Payment</span><span>${esc(sale.pay || "Cash")}</span></div>
          ${sale.note ? `<div class="row"><span>Note</span><span>${esc(sale.note)}</span></div>` : ""}
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
          <div class="center powered">${POWERED_BY}</div>
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
        header: [D.user.phone, D.user.address, (sale.kind === "service" ? `${said(serviceLabel())} ${said("Receipt")}` : said("Money Receipt"))].filter(Boolean).map(String),
        details: [
          [said("Invoice"), String(sale.inv || "")],
          [said("Date"), String(sale.date || "")],
          ...(invoiceTime(sale) ? [[said("Time"), clock12(invoiceTime(sale))] as [string, string]] : []),
          [said("Customer"), String(sale.party || said("Walk-in Customer"))],
          ...(sale.phone ? [[said("Mobile"), String(sale.phone)] as [string, string]] : []),
          [said("Payment"), said(String(sale.pay || "Cash"))],
          ...(sale.note ? [[said("Note"), String(sale.note)] as [string, string]] : []),
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
    // Shown wherever a printer can be connected by cable, because a USB printer never turns up in that list.
    const SERIAL_HINT = "The serial cable button is only for a printer that Windows shows as a COM port. A printer on a USB cable does not appear there: use Bluetooth, or the print window.";
    const sendReceipt = async (sale: any): Promise<boolean> => {
      if (!PRINTER_LINK) return false;
      try {
        const picture = receiptPicture(sale);
        await PRINTER_LINK.send(RECEIPT_OPTIONS.kind === "tspl" ? tsplReceiptJob(picture) : escposJob(picture));
        toast("Receipt sent. If nothing prints, check the printer type and the port you chose.");
        return true;
      } catch (error) {
        console.error("Could not print the receipt directly", error);
        PRINTER_LINK = null;
        toast("The printer stopped answering. Connect it again.");
        return false;
      }
    };
    const receiptDialog = (id: number) => {
      const sale = findInvoice(id);
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
            : `${canUseBluetooth() ? `<button class="btn pu" id="rcBluetooth" type="button">Connect by Bluetooth</button>` : ""}${canUseSerial() ? `<button class="btn" id="rcSerial" type="button" ${quiet}>Connect by serial cable (COM port)</button>` : ""}`}
          <button class="btn ${canConnect ? "" : "pu"}" id="rcShare" type="button" ${canConnect ? quiet : ""}>Share or save picture</button>
          <button class="btn" id="rcWindow" type="button" ${quiet}>Open print window</button>
          <button class="btn" id="rcClose" type="button" ${quiet}>Close</button>
        </div>
        ${!PRINTER_LINK && canUseSerial() ? `<p class="settings-help" style="margin:10px 0 0">${SERIAL_HINT}</p>` : ""}
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
      if (!dialog.open) {
        dialog.showModal();
        // With a keyboard, Enter then prints and Esc closes.
        if (KEYBOARD_DEVICE) ($("#rcPrint") || $("#rcWindow"))?.focus();
      }

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
      const sale = findInvoice(id);
      if (sale && PRINTER_LINK) void sendReceipt(sale);
      else receiptDialog(id);
    };

    let PRODUCT_LIST_QUERY = "";
    let PRODUCT_LIST_LIMIT = 10;
    let PRODUCT_LIST_PAGE = 1;

    const filteredProducts = () => D.products.filter((product: any) => {
      const query = PRODUCT_LIST_QUERY.toLowerCase();
      return `${product.name || ""} ${product.code || ""} ${nm("brands", product.brand)} ${nm("categories", product.category)} ${productDetails(product)}`
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
          <td>${esc(product.name)}${productDetails(product) ? `<br><small class="mut">${esc(productDetails(product))}</small>` : ""}</td><td>${esc(product.code)}</td>
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
      if (!ownerOnly()) return;
      const product = prod(id);
      if (!product) return;
      // The fields this kind of shop uses, and any the product already has from before the kind was changed.
      const extraIds = Object.keys(EXTRA_FIELDS).filter((id) => businessType().extra.includes(id) || product[id]);
      const bySize = businessType().show.includes("sizeStock") || sizeList(product).length > 0;
      const dialog = $("#dlg");
      dialog.innerHTML = `
        <h3>Edit Product</h3>
        <label>Product Name</label><input id="ep_name" value="${esc(product.name)}">
        <label>Product Code</label><input id="ep_code" value="${esc(product.code)}">
        <label>Brand</label><select id="ep_brand">${opts(D.brands, product.brand)}</select>
        <label>Category</label><select id="ep_category">${opts(D.categories, product.category)}</select>
        <label>Unit</label><select id="ep_unit">${opts(D.units, product.unit)}</select>
        ${extraIds.map((id) => `<label>${EXTRA_FIELDS[id][0]}</label><input id="ep_${id}" value="${esc(product[id] || "")}" placeholder="${EXTRA_FIELDS[id][1]}">`).join("")}
        <div class="two"><div><label>Purchase Price</label><input id="ep_buy" type="number" min="0" step="0.01" value="${+product.buy || 0}"></div><div><label>Sale Price</label><input id="ep_sell" type="number" min="0" step="0.01" value="${+product.sell || 0}"></div></div>
        <div class="two"><div><label>Stock</label><input id="ep_stock" type="number" min="0" step="any" value="${+product.stock || 0}"></div><div><label>Low Stock Alert</label><input id="ep_lowAlert" type="number" min="0" step="1" placeholder="EX: 5" value="${+product.lowAlert || ""}"></div><div><label>Serial</label><select id="ep_serial"><option value="false" ${product.hasSerial ? "" : "selected"}>No</option><option value="true" ${product.hasSerial ? "selected" : ""}>Yes</option></select></div></div>
        ${bySize ? sizeEditorHtml() : ""}
        <label id="editSerialInventoryField">Available Serial Numbers<textarea id="ep_serials" class="product-serial-input" placeholder="Enter one serial number per line, or separate with commas">${esc((product.serials || []).join("\n"))}</textarea></label>
        <label>Replace Image (optional, max ${MAX_IMAGE_FILE_KB} KB)</label><input id="ep_image" type="file" accept="image/*">
        <div class="two" style="margin-top:16px"><button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button><button class="btn pu" type="button" id="saveProductEdit">Save Changes</button></div>`;
      dialog.showModal();
      const readSizes = bySize ? sizeEditor(sizeList(product), $("#ep_stock"), $("#ep_category")) : () => [];
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
          ...Object.fromEntries(extraIds.map((id) => [id, $("#ep_" + id).value.trim()])),
          buy: Math.max(0, +$("#ep_buy").value || 0), sell: Math.max(0, +$("#ep_sell").value || 0),
          sizes: readSizes(), stock: Math.max(0, +$("#ep_stock").value || 0), lowAlert: Math.max(0, +$("#ep_lowAlert").value || 0), hasSerial: $("#ep_serial").value === "true",
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
      const options: [string, string][] = [["lowStock", "Low stock alerts"], ["expiry", "Expiry date alerts"], ["dueReminders", "Customer due reminders"], ["sales", "New sale notifications"], ["purchases", "New purchase notifications"], ["expenses", "Expense notifications"]];
      $("#app").innerHTML = `<section class="card settings-card"><h2>Notifications</h2><p class="settings-help">Choose which in-app alerts you want to enable.</p><form id="notificationForm">${options.map(([key, label]) => `<label class="setting-toggle"><span>${label}</span><input type="checkbox" name="${key}" ${D.settings.notifications[key] ? "checked" : ""}></label>`).join("")}<button class="btn pu" type="submit">Save Changes</button></form></section>`;
      $("#notificationForm").addEventListener("submit", (event: Event) => {
        event.preventDefault();
        D.settings.notifications = Object.fromEntries(options.map(([key]) => [key, ($(`#notificationForm [name="${key}"]`) as HTMLInputElement).checked]));
        save(); toast("Notification settings saved");
      });
    };

    const generalSettingsPage = () => {
      $("#app").innerHTML = `<section class="card settings-card"><h2>General Settings</h2><p class="settings-help">Shop information and defaults used in sales and receipts.</p><form id="generalSettingsForm"><div class="settings-form-grid"><label>Shop Name<input id="settingShop" value="${esc(D.user.shop || "")}" required></label><label>Business Type<select id="settingBusinessType">${Object.entries(BUSINESS_TYPES).map(([id, kind]) => `<option value="${id}" ${id === (D.settings.businessType || "general") ? "selected" : ""}>${kind.label}</option>`).join("")}</select></label><label>Shop Logo (max ${MAX_IMAGE_FILE_KB} KB)<input id="settingLogo" type="file" accept="image/*">${D.user.logo ? `<span style="display:flex;align-items:center;gap:10px;margin-top:8px"><img src="${esc(D.user.logo)}" alt="Current logo" style="height:44px;border-radius:6px"><label style="display:flex;align-items:center;gap:6px;font-weight:400"><input id="settingLogoRemove" type="checkbox" style="width:auto"> Remove logo</label></span>` : ""}</label><label>Email<input id="settingEmail" type="email" value="${esc(D.user.shopEmail || "")}"></label><label>Phone<input id="settingPhone" type="tel" value="${esc(D.user.phone || "")}"></label><label>Address<input id="settingAddress" value="${esc(D.user.address || "")}"></label><label>Default Currency<select id="settingCurrency">${opts(D.currencies, D.settings.currencyId)}</select></label><label>Current User Role${!isWorkspaceOwner ? `<input value="${esc(D.roles.find((entry: any) => entry.id == (isWorkspaceOwner ? D.user.roleId : activeRoleId))?.name || "Assigned role")}" disabled>` : `<select id="settingRole">${opts(D.roles, D.user.roleId)}</select>`}</label><label>Default VAT (%)<input id="settingTax" type="number" min="0" step="0.01" value="${+D.settings.taxRate || 0}"></label><label class="settings-wide">Invoice Footer<input id="settingFooter" value="${esc(D.settings.invoiceFooter || "Thank you for your purchase!")}"></label><label class="settings-wide" style="display:flex;align-items:center;gap:8px;font-weight:400"><input id="settingNeedPhone" type="checkbox" style="width:auto" ${D.settings.requirePhone ? "checked" : ""}> Every sale and service bill needs the customer's phone number</label><label class="settings-wide" style="display:flex;align-items:center;gap:8px;font-weight:400"><input id="settingStaffPrice" type="checkbox" style="width:auto" ${D.settings.staffCanChangePrice ? "checked" : ""}> Staff can change prices and give discounts while selling</label><label class="settings-wide" style="display:flex;align-items:center;gap:8px;font-weight:400"><input id="settingNeedReceived" type="checkbox" style="width:auto" ${D.settings.requireReceived ? "checked" : ""}> The amount received has to be typed on every sale</label></div><button class="btn pu" type="submit">Save Changes</button></form></section>`;
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
        D.settings.requirePhone = $("#settingNeedPhone").checked;
        D.settings.requireReceived = $("#settingNeedReceived").checked;
        D.settings.staffCanChangePrice = $("#settingStaffPrice").checked;
        D.settings.businessType = $("#settingBusinessType").value;
        // Give the shop the units and categories its kind of business usually needs.
        for (const list of ["units", "categories"] as const) {
          for (const name of businessType()[list]) {
            if (!D[list].some((entry: any) => String(entry.name).toLowerCase() === name.toLowerCase())) D[list].push({ id: uid(), name, status: "Active" });
          }
        }
        CURRENCY_SYMBOL = D.currencies.find((currency: any) => currency.id == D.settings.currencyId)?.symbol || String.fromCharCode(2547);
        save(); hdr(); render(); toast("General settings saved");
      });
    };

    const ROLE_PERMISSIONS = ["Dashboard", "Sales", "Service Sale", "Purchases", "Products", "Stock List", "Employee", "Salary Slip", "Warehouse", "Customers", "Suppliers", "Expenses", "Due List", "Profit & Loss List", "Profile", "Settings"];
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
            : `${canUseBluetooth() ? `<button class="btn pu" id="bcBluetooth" type="button">Connect by Bluetooth</button>` : ""}${canUseSerial() ? `<button class="btn" id="bcSerial" type="button" ${quiet}>Connect by serial cable (COM port)</button>` : ""}${canUseBluetooth() || canUseSerial() ? "" : `<span style="color:var(--rd)">This browser cannot connect to a printer directly. Use Chrome or Edge on a computer.</span>`}`}
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0"><input id="bcContinuous" type="checkbox" style="width:auto" ${options.continuous ? "checked" : ""}> Paper has no gaps between labels</label>
          </div>
          ${!PRINTER_LINK && canUseSerial() ? `<p class="settings-help" style="margin:10px 0 0">${SERIAL_HINT}</p>` : ""}
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
          toast("Sent. If nothing prints, check that you chose the right printer.");
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
    // ---- Platform admin: copies of the whole site sent to the admin's own Google Drive.
    const DRIVE_SETUP = [
      "Open console.cloud.google.com and make a new project.",
      "In APIs & Services > Library, find Google Drive API and press Enable.",
      "In APIs & Services > OAuth consent screen, choose External and fill in the app name and your email. Then, under Audience, press Publish app.",
      "In APIs & Services > Credentials, press Create Credentials > OAuth client ID and choose Web application. Under Authorized redirect URIs, add the address shown below.",
      "Copy the Client ID and the Client secret it gives you into the boxes here, press Save, and then press Connect Google Drive.",
    ];
    const DRIVE_NOTES: Record<string, string> = {
      connected: "Google Drive is connected. The first copy is taken the next time a shop is opened, or press Back up now.",
      refused: "Google Drive was not connected, because access was not allowed.",
      expired: "That took too long. Press Connect Google Drive again.",
      unreachable: "Google could not be reached. Try again in a little while.",
      failed: "Google did not accept the Client ID and Client secret. Check them and connect again.",
      setup: "Save the Client ID and Client secret first.",
    };
    const drivePage = async () => {
      const app = $("#app");
      app.innerHTML = `<section class="card settings-card"><h2>Google Drive Backup</h2><p class="mut">Loading…</p></section>`;
      // Google sends the admin back here with the outcome in the address.
      const note = new URLSearchParams(location.search).get("drive") || "";
      if (note) history.replaceState(null, "", location.pathname + location.hash);
      let status;
      try {
        status = await hostingApi.driveStatus();
      } catch (error) {
        app.innerHTML = `<section class="card settings-card"><h2>Google Drive Backup</h2><p class="settings-help">${esc(error instanceof Error ? error.message : "Could not load this page.")}</p></section>`;
        return;
      }
      if (location.hash.slice(1) !== "admin-drive") return;
      const ready = Boolean(status.clientId && status.hasSecret);
      const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
      const fileRows = status.files.map((file, index) => `<tr><td>${index + 1}</td><td data-no-translate>${esc(file.name)}</td><td>${esc(new Date(file.createdTime).toLocaleString())}</td><td>${size(file.size)}</td></tr>`).join("");
      const setup = `
        <div class="guide-step"><h3>${status.connected ? "Google account settings" : "1. Set it up with Google (once)"}</h3>
          ${status.connected ? "" : `<ol class="drive-steps">${DRIVE_SETUP.map((line) => `<li>${line}</li>`).join("")}</ol>
          <label class="drive-copy">Authorized redirect URI<input id="driveRedirect" value="${esc(status.redirectUri)}" readonly onclick="this.select()"></label>`}
          <form id="driveSettings"><div class="settings-form-grid">
            <label>Client ID<input id="driveClientId" value="${esc(status.clientId)}" autocomplete="off" required></label>
            <label>Client secret<input id="driveSecret" type="password" autocomplete="new-password" placeholder="${status.hasSecret ? "Saved. Type a new one to change it." : ""}" ${status.hasSecret ? "" : "required"}></label>
          </div><button class="btn ${ready ? "or" : "pu"}" type="submit">Save</button></form>
        </div>`;
      app.innerHTML = `
        <section class="card settings-card">
          <div class="hd"><h2>Google Drive Backup</h2><span class="bd ${status.connected ? "ok" : "dn"}">${status.connected ? "Connected" : "Not connected"}</span></div>
          <p class="settings-help">Every day the whole database is copied to your own Google Drive, and the pictures once a week. Copies older than ${status.keepDays} days are deleted from Drive by themselves.</p>
          ${note && DRIVE_NOTES[note] ? `<p class="plan-note ${note === "connected" ? "ok" : ""}" role="status">${DRIVE_NOTES[note]}</p>` : ""}
          ${status.connected ? `
            <div class="guide-step"><h3>Copies on Google Drive</h3>
              ${status.problem ? `<p class="plan-note" role="alert" data-no-translate>${esc(status.problem)}</p>` : ""}
              <p class="settings-help">${status.lastRun ? `<span>Last copy</span>: <span data-no-translate>${esc(status.lastRun)} — ${esc(status.lastResult)}</span>` : "No copy has been taken yet."}</p>
              <div class="lx-acts" style="justify-content:flex-start;margin-bottom:12px"><button class="btn pu" type="button" id="driveRun">Back up now</button><button class="btn or" type="button" id="driveDisconnect">Disconnect</button></div>
              <div class="wrap"><table><thead><tr><th>SL.</th><th>File</th><th>Date</th><th>Size</th></tr></thead><tbody>${fileRows || empty(4)}</tbody></table></div>
            </div>${setup}` : `${setup}
            <div class="guide-step"><h3>2. Connect</h3>
              <p class="settings-help">Google will ask whether this site may keep its own files on your Drive. It cannot see anything else there.</p>
              ${ready ? `<a class="btn pu" href="/api/drive.php?action=connect">Connect Google Drive</a>` : `<button class="btn pu" type="button" disabled>Connect Google Drive</button>`}
            </div>`}
        </section>`;

      $("#driveSettings").addEventListener("submit", async (event: Event) => {
        event.preventDefault();
        try {
          await hostingApi.driveSettings($("#driveClientId").value.trim(), $("#driveSecret").value.trim());
          toast("Settings saved");
          void drivePage();
        } catch (error) {
          toast(error instanceof Error ? error.message : "The settings could not be saved.");
        }
      });
      $("#driveRun")?.addEventListener("click", async (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        button.textContent = "Backing up…";
        try {
          const { result } = await hostingApi.driveRun();
          toast(result.ok ? "The copy is on Google Drive" : result.message);
        } catch (error) {
          toast(error instanceof Error ? error.message : "The copy could not be taken.");
        }
        void drivePage();
      });
      $("#driveDisconnect")?.addEventListener("click", async () => {
        if (!confirm("Stop sending copies to Google Drive? The copies already there stay.")) return;
        await hostingApi.driveDisconnect().catch(() => undefined);
        void drivePage();
      });
    };

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
        body.innerHTML = `<form id="adminSettingsForm" style="padding:0 18px 18px"><div class="settings-form-grid"><label>Monthly price (Taka)<input id="adminMonthly" type="number" min="0" step="1" value="${s.priceMonthly}" required></label><label>Yearly price (Taka)<input id="adminYearly" type="number" min="0" step="1" value="${s.priceYearly}" required></label><label>Free trial (days)<input id="adminTrial" type="number" min="0" max="365" step="1" value="${s.trialDays}" required></label><label>Days allowed before email must be confirmed<input id="adminGrace" type="number" min="0" max="365" step="1" value="${s.verifyGraceDays}" required></label><label>Support phone<input id="adminSupport" type="tel" value="${esc(s.supportPhone)}"></label><label>Support WhatsApp number<input id="adminWhatsapp" type="tel" value="${esc(s.supportWhatsapp)}" placeholder="01XXXXXXXXX"></label><label>Support email<input id="adminEmail" type="email" value="${esc(s.supportEmail)}"></label><label>Facebook page (name or link)<input id="adminFacebook" value="${esc(s.supportFacebook)}" placeholder="https://facebook.com/yourpage"></label><label>Support hours<input id="adminHours" value="${esc(s.supportHours)}" placeholder="EX: 10 AM - 10 PM"></label><label>bKash number (customers send money here)<input id="adminBkash" type="tel" value="${esc(s.bkashNumber)}" placeholder="01XXXXXXXXX"></label><label>Nagad number<input id="adminNagad" type="tel" value="${esc(s.nagadNumber)}" placeholder="01XXXXXXXXX"></label></div><button class="btn pu" type="submit">Save Changes</button></form>`;
        $("#adminSettingsForm").addEventListener("submit", (event: Event) => {
          event.preventDefault();
          void run("settings", {
            price_monthly: +$("#adminMonthly").value, price_yearly: +$("#adminYearly").value, trial_days: +$("#adminTrial").value, verify_grace_days: +$("#adminGrace").value,
            support_phone: $("#adminSupport").value, support_whatsapp: $("#adminWhatsapp").value, support_email: $("#adminEmail").value, support_facebook: $("#adminFacebook").value, support_hours: $("#adminHours").value,
            bkash_number: $("#adminBkash").value, nagad_number: $("#adminNagad").value,
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

    // The guide a new shop follows: heading, lines, and the screen its button opens.
    const GUIDE_STEPS: [string, string[], [string, string] | null][] = [
      ["1. Enter your shop's details", [
        "Write your shop's name, phone number and address, and add your logo. These are printed at the top of every receipt.",
        "On the same screen you can choose whether a sale needs the customer's phone number.",
      ], ["Open General Settings", "settings-general"]],
      ["2. Add your products", [
        "For each product enter its name, buying price, selling price and how many you have in stock.",
        "Product code: if the product already has a barcode on its packet, click in the code box and scan it. If not, type any number of your own; you can print a barcode for it in the next step.",
        "Set a low stock alert quantity, and the bell at the top will warn you when the product is running out.",
      ], ["Add a product", "product-add"]],
      ["3. Print barcode labels", [
        "Choose the products and how many labels of each, connect your label printer by Bluetooth, and print.",
        "Set the label's width and height once to match your label roll; they are remembered.",
        "Printing straight to a Bluetooth printer works in Chrome on a computer or an Android phone.",
      ], ["Open Barcodes", "barcodes"]],
      ["4. Make a sale", [
        "Add products to the bill in any of these ways: scan the barcode with a scanner, type part of the name or code and press Enter, or tap the product's picture.",
        "On a phone, press the camera button beside the box and hold the camera over the barcode. The camera then comes on by itself each time.",
        "Write the amount the customer paid in Receive Amount. If it is less than the total, the rest is kept as due.",
        "Press Save. The receipt window opens; print it, or share it as a picture.",
      ], ["Open Sale New", "sale-new"]],
      ["5. Work faster with the keyboard", [
        "F2 opens a new sale from any screen and puts the cursor in the product box.",
        "F1 goes to the customer's phone number; type it and press Enter to go on to the products.",
        "Arrow keys choose from the list and Enter adds. With the box empty, + and − change the quantity of the last product and Delete removes it.",
        "F4 goes to Receive Amount; type the amount and press Enter to save. F9 saves from anywhere.",
      ], null],
      ["6. When new stock arrives", [
        "Enter it as a purchase: choose the supplier, add the products and quantities, and save. The stock goes up by itself.",
      ], ["Open Purchase New", "purchase-new"]],
      ["7. Collect dues", [
        "The Due List shows everyone who still owes you money, and how long it has been owing.",
        "When the customer pays, press Receive Payment beside their name and type the amount.",
      ], ["Open Due List", "dues"]],
      ["8. Give your staff their own login", [
        "Add a role, tick only the screens that person should see, and give them an email and password. Do not share your own password.",
      ], ["Open User Role", "settings-roles"]],
      ["9. Good to know", [
        "No internet? Keep selling. Your work is kept on the device and sent by itself when the internet returns.",
        "The same shop can be open on a computer and several phones at once; they all show the same data.",
        "A backup of your shop is taken every day. The owner can download or restore one under Settings, Backup.",
        "On a phone, open the browser's menu and choose Add to Home screen to use HishabPOS like an app.",
      ], null],
    ];

    const helpPage = () => {
      $("#app").innerHTML = `<section class="card settings-card"><h2>How to use HishabPOS</h2><p class="settings-help">Follow these steps in order when you start. Each one has a button that takes you to the right screen.</p>${GUIDE_STEPS.map(([heading, lines, button]) => `<div class="guide-step"><h3>${heading}</h3><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>${button ? `<a class="btn pu" href="#${button[1]}">${button[0]}</a>` : ""}</div>`).join("")}<div class="guide-step" id="helpContact" hidden><h3>Need help? Contact us</h3></div></section>`;
      // How to reach us is set by the admin, so it is fetched instead of written here.
      void loadContact().then((info) => {
        const box = $("#helpContact");
        const links = contactHtml(info);
        if (!box || !links) return;
        box.insertAdjacentHTML("beforeend", links);
        box.hidden = false;
      });
    };

    // ---- Customers, suppliers and dues: one line per person with what is owing, and payments taken here.
    type DueList = "sales" | "purchases";
    type PeopleList = "customers" | "suppliers";
    let DUE_VIEW: DueList = "sales";
    let DUE_QUERY = "";
    let PEOPLE_QUERY = "";
    const money2 = (amount: number) => Math.round(amount * 100) / 100;
    // A phone number however it was typed (+880, spaces, dashes) comes down to its last 11 digits.
    const phoneKey = (value: any) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length > 11 ? digits.slice(-11) : digits;
    };
    const customerByPhone = (phone: any) => {
      const key = phoneKey(phone);
      return key ? D.customers.find((person: any) => phoneKey(person.phone) === key) : undefined;
    };
    // Once a customer is saved, typing their number fills in their name. The saved numbers
    // are offered while typing. A name typed by hand is left alone.
    const linkCustomerPhone = (phoneBox: HTMLInputElement | null, nameBox: HTMLInputElement | null) => {
      if (!phoneBox || !nameBox) return;
      const listId = `${phoneBox.id}Known`;
      phoneBox.setAttribute("list", listId);
      phoneBox.insertAdjacentHTML("afterend", `<datalist id="${listId}">${D.customers.filter((person: any) => person.phone).map((person: any) => `<option value="${esc(person.phone)}">${esc(person.name)}</option>`).join("")}</datalist>`);
      phoneBox.addEventListener("input", () => {
        const known = customerByPhone(phoneBox.value);
        if (known && (!nameBox.value.trim() || nameBox.dataset.auto === "1")) {
          nameBox.value = known.name || "";
          nameBox.dataset.auto = "1";
        } else if (!known && nameBox.dataset.auto === "1") {
          nameBox.value = "";
          nameBox.dataset.auto = "";
        }
        nameBox.classList.toggle("known-customer", Boolean(known) && nameBox.dataset.auto === "1");
      });
      nameBox.addEventListener("input", () => {
        nameBox.dataset.auto = "";
        nameBox.classList.remove("known-customer");
      });
    };
    const daysSince = (date: string) => Math.max(0, Math.round((Date.parse(today()) - Date.parse(date)) / 864e5) || 0);

    const LX_ICONS: Record<string, string> = {
      people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
      cart: '<path d="M3 4h2l2.2 11.5a2 2 0 0 0 2 1.5h8.9a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
      wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><path d="M17 14h.01"/>',
      truck: '<path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
      print: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
      box: '<path d="m12 3 9 5v8l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
      trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
      down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    };
    const lxIcon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${LX_ICONS[name]}</svg>`;
    const lxKpi = (icon: string, label: string, value: string, note: string, color: string) =>
      `<div class="lx-kpi" style="--c:${color}"><em>${lxIcon(icon)}</em><div><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div></div>`;
    const lxAvatar = (name: string) => `<i class="lx-av" data-no-translate>${esc(([...String(name || "").trim()][0] || "?").toUpperCase())}</i>`;
    const lxWho = (name: string, phone: string) =>
      `<div class="lx-who">${lxAvatar(name)}<div><b data-no-translate>${esc(name)}</b>${phone ? `<a class="lx-tel" href="tel:${esc(phone)}">${esc(phone)}</a>` : ""}</div></div>`;
    // On a phone each row becomes a card, and every figure shows what it is.
    const lxLabel = (text: string) => `data-label="${esc(said(text))}"`;
    const lxPill = (text: string, color: string) => `<span class="lx-pill" style="--c:${color}">${text}</span>`;
    const lxEmpty = (columns: number, text: string) => `<tr class="lx-empty"><td colspan="${columns}"><span>${text}</span></td></tr>`;

    // The phone number tells people apart when there is one, otherwise the name does.
    const dueParties = (list: DueList): AnyData[] => {
      const parties = new Map<string, AnyData>();
      for (const entry of list === "sales" ? [...D.sales, ...D.services] : D[list]) {
        if (!(+entry.due > 0) || entry.ret) continue;
        const key = String(entry.phone || entry.party || "").trim().toLowerCase();
        const party = parties.get(key) || { name: entry.party || "-", phone: entry.phone || "", invoices: [], due: 0 };
        party.invoices.push(entry);
        party.due = money2(party.due + +entry.due);
        parties.set(key, party);
      }
      return [...parties.values()].map((party): AnyData => {
        party.invoices.sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
        return { ...party, oldest: party.invoices[0].date, days: daysSince(party.invoices[0].date) };
      }).sort((a, b) => b.due - a.due);
    };

    function duesPage() {
      const customers = dueParties("sales");
      const suppliers = dueParties("purchases");
      const late = customers.filter((party) => party.days > 30);
      const forCustomers = DUE_VIEW === "sales";

      $("#app").innerHTML = `
        <div class="lx">
          <div class="lx-kpis">
            ${lxKpi("wallet", "Customers Owe You", tk(sum(customers, (party) => party.due)), `${customers.length} customers`, "var(--gr)")}
            ${lxKpi("truck", "You Owe Suppliers", tk(sum(suppliers, (party) => party.due)), `${suppliers.length} suppliers`, "var(--rd)")}
            ${lxKpi("clock", "Overdue More Than 30 Days", tk(sum(late, (party) => party.due)), `${late.length} customers`, "var(--or)")}
          </div>
          <section class="card">
            <div class="hd">
              <h2>Due List</h2>
              <button class="lx-out lx-noprint" type="button" onclick="window.print()">${lxIcon("print")}<span>Print</span></button>
            </div>
            <div class="lx-bar">
              <div class="lx-seg">
                <button type="button" class="${forCustomers ? "on" : ""}" data-view="sales">Customer Due</button>
                <button type="button" class="${forCustomers ? "" : "on"}" data-view="purchases">Supplier Due</button>
              </div>
              <span class="sp"></span>
              <input class="srch" id="dueSearch" value="${esc(DUE_QUERY)}" placeholder="Search by name or phone">
            </div>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>${forCustomers ? "Customer" : "Supplier"}</th><th class="num">Invoices</th><th>Oldest Due</th><th class="num">Total Due</th><th></th></tr></thead>
              <tbody id="dueRows"></tbody>
            </table></div>
          </section>
        </div>`;

      let shown: AnyData[] = [];
      const drawRows = () => {
        const query = DUE_QUERY.trim().toLowerCase();
        shown = (forCustomers ? customers : suppliers).filter((party) => `${party.name} ${party.phone}`.toLowerCase().includes(query));
        $("#dueRows").innerHTML = shown.map((party, index) => `
          <tr>
            <td class="lx-main">${lxWho(party.name, party.phone)}</td>
            <td class="num" ${lxLabel("Invoices")}>${party.invoices.length}</td>
            <td ${lxLabel("Oldest Due")}><span class="lx-when">${esc(party.oldest)} ${lxPill(`${party.days} days`, party.days > 30 ? "var(--rd)" : "var(--mut)")}</span></td>
            <td class="num" ${lxLabel("Total Due")}><b class="lx-due">${tk(party.due)}</b></td>
            <td><div class="lx-acts"><button class="lx-go" type="button" data-pay="${index}">${forCustomers ? "Receive Payment" : "Pay"}</button><button class="lx-ic" type="button" title="Details" aria-label="Details" data-details="${index}">${lxIcon("eye")}</button></div></td>
          </tr>`).join("")
          || lxEmpty(5, forCustomers ? "No customer owes you anything" : "You owe no supplier anything");
      };
      drawRows();

      $("#dueSearch").addEventListener("input", (event: Event) => { DUE_QUERY = (event.currentTarget as HTMLInputElement).value; drawRows(); });
      document.querySelectorAll(".lx-seg [data-view]").forEach((button) => button.addEventListener("click", () => {
        DUE_VIEW = (button as HTMLElement).dataset.view as DueList;
        DUE_QUERY = "";
        duesPage();
      }));
      $("#dueRows").addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("button") as HTMLElement | null;
        if (!button) return;
        if (button.dataset.pay) duePaymentDialog(shown[+button.dataset.pay], forCustomers);
        if (button.dataset.details) dueDetailsDialog(shown[+button.dataset.details], forCustomers);
      });
    }

    const lxDialogHead = (name: string, phone: string, address = "") => `
      <div class="lx-head">${lxAvatar(name)}<div><b data-no-translate>${esc(name)}</b>
        ${phone ? `<a class="lx-tel" href="tel:${esc(phone)}">${esc(phone)}</a>` : ""}
        ${address ? `<small data-no-translate>${esc(address)}</small>` : ""}</div></div>`;

    const duePaymentDialog = (party: AnyData, fromCustomer: boolean) => {
      if (!party) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>${fromCustomer ? "Receive Payment" : "Pay Supplier"}</h3>
        ${lxDialogHead(party.name, party.phone)}
        <div class="lx-owed"><span>Total Due</span><b>${tk(party.due)}</b></div>
        <label>Amount</label><input id="duePayAmount" type="number" inputmode="decimal" min="0.01" max="${party.due}" step="0.01" value="${party.due}">
        <div class="lx-quick"><button type="button" data-part="1">Full amount</button><button type="button" data-part="0.5">Half</button><span>Due after this payment</span><b id="duePayLeft"></b></div>
        <div class="two" style="margin-top:10px">
          <div><label>Payment Type</label><select id="duePayMethod">${["Cash", "bKash", "Nagad", "Card"].map((type) => `<option value="${type}">${type}</option>`).join("")}</select></div>
          <div><label>Date</label><input id="duePayDate" type="date" value="${today()}"></div>
        </div>
        <p class="settings-help">${party.invoices.length > 1 ? "The payment is taken off the oldest invoice first." : `Invoice ${esc(party.invoices[0].inv)}`}</p>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="saveDuePayment">Save Payment</button>
        </div></div>`;
      dialog.showModal();
      const amountBox = $("#duePayAmount") as HTMLInputElement;
      const showLeft = () => { $("#duePayLeft").textContent = tk(Math.max(0, money2(party.due - (+amountBox.value || 0)))); };
      amountBox.addEventListener("input", showLeft);
      dialog.querySelectorAll("[data-part]").forEach((button) => button.addEventListener("click", () => {
        amountBox.value = String(money2(party.due * +(button as HTMLElement).dataset.part!));
        showLeft();
      }));
      showLeft();
      amountBox.select();
      $("#saveDuePayment").addEventListener("click", () => {
        const amount = money2(+amountBox.value || 0);
        if (!(amount > 0)) { toast("Enter the amount paid"); return; }
        if (amount > party.due) { toast("The amount is more than the due"); return; }
        const payment = { date: $("#duePayDate").value || today(), method: $("#duePayMethod").value };
        let left = amount;
        for (const entry of party.invoices) {
          if (left <= 0) break;
          const part = Math.min(left, +entry.due);
          entry.paid = money2((+entry.paid || 0) + part);
          entry.due = money2(+entry.due - part);
          // Kept on the invoice so the history of what was paid when stays with it.
          entry.payments = [...(entry.payments || []), { ...payment, amount: part }];
          left = money2(left - part);
        }
        save();
        dialog.close();
        render();
        toast("Payment saved");
      });
    };

    const dueDetailsDialog = (party: AnyData, fromCustomer: boolean) => {
      if (!party) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>Due Details</h3>
        ${lxDialogHead(party.name, party.phone)}
        <div class="lx-owed"><span>Total Due</span><b>${tk(party.due)}</b></div>
        <div class="wrap lx-scroll"><table class="lx-mini">
          <thead><tr><th>Invoice</th><th>Date</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th></tr></thead>
          <tbody>${party.invoices.map((entry: any) => `
            <tr><td>${fromCustomer ? `<button class="lx-link" type="button" data-invoice="${entry.id}">${esc(entry.inv)}</button>` : esc(entry.inv)}</td><td>${esc(entry.date)}</td><td class="num">${tk(entry.total)}</td><td class="num">${tk(entry.paid)}</td><td class="num"><b>${tk(entry.due)}</b></td></tr>
            ${(entry.payments || []).map((payment: any) => `<tr class="lx-hist"><td></td><td>${esc(payment.date)}</td><td colspan="2"><span>${fromCustomer ? "Payment received" : "Payment made"}</span> · <span>${esc(payment.method)}</span></td><td class="num">${tk(payment.amount)}</td></tr>`).join("")}`).join("")}
          </tbody>
        </table></div>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Close</button>
          <button class="btn pu" type="button" id="dueDetailsPay" autofocus>${fromCustomer ? "Receive Payment" : "Pay"}</button>
        </div></div>`;
      dialog.showModal();
      dialog.querySelectorAll("[data-invoice]").forEach((button) => button.addEventListener("click", () => openInvoice(+(button as HTMLElement).dataset.invoice!)));
      $("#dueDetailsPay").addEventListener("click", () => duePaymentDialog(party, fromCustomer));
    };

    // An invoice belongs to the person it was made for; invoices from before that was recorded only carry the name and phone.
    const personInvoices = (k: PeopleList, person: any) => {
      const phone = String(person.phone || "").trim();
      const name = String(person.name || "").trim().toLowerCase();
      return (k === "customers" ? [...D.sales, ...D.services] : D.purchases).filter((entry: any) =>
        entry.partyId ? entry.partyId == person.id
          : phone && entry.phone ? String(entry.phone).trim() === phone
            : String(entry.party || "").trim().toLowerCase() === name);
    };
    const personTotals = (k: PeopleList, person: any) => {
      const invoices = personInvoices(k, person);
      const counted = invoices.filter((entry: any) => !entry.ret);
      return {
        invoices,
        total: sum(counted, (entry) => +entry.total || 0),
        paid: sum(counted, (entry) => +entry.paid || 0),
        due: money2(sum(counted, (entry) => +entry.due || 0)),
      };
    };
    // What the person can be asked to pay now: their open invoices, oldest first.
    const personOwing = (person: any, totals: AnyData) => ({
      name: person.name,
      phone: person.phone || "",
      due: totals.due,
      invoices: totals.invoices.filter((entry: any) => +entry.due > 0 && !entry.ret)
        .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))),
    });

    // ---- Service sales: work done for a customer (fitting a sticker, washing a bike) rather
    // than goods from stock. The price is typed each time, no stock moves, and each one
    // gets its own numbered receipt. They are kept apart from the shop's sales.
    let SERVICE_QUERY = "";
    let SERVICE_LIMIT = 25;
    const serviceNames = () => {
      const names = new Map<string, string>();
      for (const entry of D.services) for (const item of entry.items || []) {
        const name = String(item.name || "").trim();
        if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
      }
      return [...names.values()].slice(0, 200);
    };

    function servicesPage() {
      const day = today();
      const month = day.slice(0, 7);
      const todays = D.services.filter((entry: any) => entry.date === day);
      const months = D.services.filter((entry: any) => String(entry.date).startsWith(month));
      const owing = D.services.filter((entry: any) => +entry.due > 0);

      $("#app").innerHTML = `
        <div class="lx">
          <div class="lx-kpis">
            ${lxKpi("tool", "Today's Income", tk(sum(todays, (entry) => entry.total)), `${todays.length} receipts`, "var(--pu)")}
            ${lxKpi("trend", "This Month", tk(sum(months, (entry) => entry.total)), `${months.length} receipts`, "var(--gr)")}
            ${lxKpi("clock", "Due Amount", tk(sum(owing, (entry) => entry.due)), `${owing.length} receipts`, "var(--rd)")}
          </div>
          <section class="card">
            <div class="hd">
              <h2><span>${esc(serviceLabel())}</span> · <span>Bill List</span></h2>
              <button class="lx-add" type="button" id="newService">${lxIcon("plus")}<span>New Bill</span></button>
            </div>
            <div class="lx-bar">
              <input class="srch" id="serviceSearch" value="${esc(SERVICE_QUERY)}" placeholder="Search by receipt, customer or service">
            </div>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>Receipt</th><th>Customer</th><th>Service</th><th class="num">Total</th><th class="num">Paid</th><th>Status</th><th></th></tr></thead>
              <tbody id="serviceRows"></tbody>
            </table></div>
            <div id="serviceMore" class="sv-more"></div>
          </section>
        </div>`;

      const drawRows = () => {
        const query = SERVICE_QUERY.trim().toLowerCase();
        const found = D.services.filter((entry: any) => !query
          || `${entry.inv} ${entry.party} ${entry.phone} ${(entry.items || []).map((item: any) => item.name).join(" ")}`.toLowerCase().includes(query));
        $("#serviceRows").innerHTML = found.slice(0, SERVICE_LIMIT).map((entry: any) => `
          <tr>
            <td class="lx-main"><b data-no-translate>${esc(entry.inv)}</b><small class="lx-tel">${esc(entry.date)}${invoiceTime(entry) ? ` · ${esc(clock12(invoiceTime(entry)))}` : ""}</small></td>
            <td ${lxLabel("Customer")}>${lxWho(entry.partyId ? entry.party : said(entry.party || "Walk-in Customer"), entry.phone || "")}</td>
            <td ${lxLabel("Service")}><div class="sv-cell"><span class="sv-names" data-no-translate>${esc((entry.items || []).map((item: any) => +item.qty === 1 ? item.name : `${item.name} × ${+item.qty}`).join(", "))}</span>${entry.note ? `<small class="lx-tel" data-no-translate>${esc(entry.note)}</small>` : ""}</div></td>
            <td class="num" ${lxLabel("Total")}><b>${tk(entry.total)}</b></td>
            <td class="num" ${lxLabel("Paid")}>${tk(entry.paid)}</td>
            <td ${lxLabel("Status")}>${+entry.due > 0 ? `${lxPill("Due", "var(--rd)")} <b class="lx-due">${tk(entry.due)}</b>` : lxPill("Paid", "var(--gr)")}</td>
            <td><div class="lx-acts"><button class="lx-go sv-go" type="button" data-receipt="${entry.id}">${lxIcon("print")}<span>Receipt</span></button><button class="lx-ic del" type="button" title="Delete" aria-label="Delete" data-delete="${entry.id}">${lxIcon("trash")}</button></div></td>
          </tr>`).join("")
          || lxEmpty(7, D.services.length ? "No bill matches your search" : "No bill yet. Press \"New Bill\" to add the first one.");
        $("#serviceMore").innerHTML = found.length > SERVICE_LIMIT ? `<button class="lx-out" type="button" id="serviceShowMore">Show more</button>` : "";
        $("#serviceShowMore")?.addEventListener("click", () => { SERVICE_LIMIT += 25; drawRows(); });
      };
      drawRows();

      $("#newService").addEventListener("click", () => { location.hash = "services"; });
      $("#serviceSearch").addEventListener("input", (event: Event) => { SERVICE_QUERY = (event.currentTarget as HTMLInputElement).value; SERVICE_LIMIT = 25; drawRows(); });
      $("#serviceRows").addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("button") as HTMLElement | null;
        if (!button) return;
        if (button.dataset.receipt) receiptDialog(+button.dataset.receipt);
        if (button.dataset.delete && ownerOnly() && confirm("Delete this service receipt?")) {
          D.services = D.services.filter((entry: any) => entry.id != button.dataset.delete);
          save();
          servicesPage();
        }
      });
    }

    const serviceCategories = () => [...new Set(D.serviceItems.map((item: any) => String(item.category || "Other")))];

    const serviceItemDialog = (item: any, done: () => void) => {
      if (!ownerOnly()) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>${item ? "Edit Service" : "New Service"}</h3>
        <label>Service Name</label><input id="siName" value="${esc(item?.name || "")}" placeholder="e.g. Bike Wash" autocomplete="off">
        <div class="two" style="margin-top:10px">
          <div><label>Category</label><input id="siCategory" list="siCategories" value="${esc(item?.category || "")}" placeholder="e.g. Wash" autocomplete="off">
            <datalist id="siCategories">${serviceCategories().map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist></div>
          <div><label>Price</label><input id="siPrice" type="number" inputmode="decimal" min="0" step="0.01" value="${item ? +item.price || 0 : ""}"></div>
        </div>
        <label style="margin-top:10px">Cost (material and labour)</label><input id="siCost" type="number" inputmode="decimal" min="0" step="0.01" value="${item ? +item.cost || 0 : ""}" placeholder="0">
        <p class="settings-help" style="margin:6px 0 0">What doing it once costs you. The profit and loss page takes it off the price.</p>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="siSave">Save</button>
        </div></div>`;
      dialog.showModal();
      ($("#siName") as HTMLInputElement).focus();
      $("#siSave").addEventListener("click", () => {
        const name = $("#siName").value.trim();
        if (!name) { toast("Write the name of the service"); return; }
        const values = { name, category: $("#siCategory").value.trim() || "Other", price: Math.max(0, money2(+$("#siPrice").value || 0)), cost: Math.max(0, money2(+$("#siCost").value || 0)) };
        if (item) Object.assign(item, values);
        else D.serviceItems.push({ id: uid(), ...values });
        save();
        dialog.close();
        done();
      });
    };
    const addStarterServices = () => {
      const have = new Set(D.serviceItems.map((item: any) => String(item.name).toLowerCase()));
      let added = 0;
      for (const [category, list] of serviceKind().starter) for (const [name, price] of list) {
        if (have.has(name.toLowerCase())) continue;
        D.serviceItems.push({ id: uid(), name, category, price });
        added++;
      }
      save();
      toast(added ? `${added} services added` : "These services are already in your list");
    };

    // The services the shop offers, each with its usual price.
    function serviceItemsPage() {
      $("#app").innerHTML = `
        <div class="lx">
          <section class="card">
            <div class="hd">
              <h2><span>${esc(serviceLabel())}</span> · <span>Price List</span></h2>
              <div class="lx-acts">
                <button class="lx-out owner-only" type="button" id="siStarter">${lxIcon("box")}<span>Add ready-made list</span></button>
                <button class="lx-add owner-only" type="button" id="siNew">${lxIcon("plus")}<span>New Service</span></button>
              </div>
            </div>
            <p class="settings-help" style="margin-top:0">These show as buttons on the New Bill screen. Change a price here and the next bill uses it.</p>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>Service</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num">Profit</th><th></th></tr></thead>
              <tbody>${D.serviceItems.map((item: any) => `
                <tr>
                  <td class="lx-main"><b data-no-translate>${esc(item.name)}</b></td>
                  <td ${lxLabel("Category")}><span>${esc(item.category || "Other")}</span></td>
                  <td class="num" ${lxLabel("Price")}><b>${tk(item.price)}</b></td>
                  <td class="num" ${lxLabel("Cost")}>${tk(item.cost)}</td>
                  <td class="num" ${lxLabel("Profit")}><b class="${(+item.price || 0) - (+item.cost || 0) < 0 ? "pl-neg" : "pl-pos"}">${tk((+item.price || 0) - (+item.cost || 0))}</b></td>
                  <td><div class="lx-acts"><button class="lx-ic" type="button" title="Edit" aria-label="Edit" data-edit="${item.id}">${lxIcon("edit")}</button><button class="lx-ic del" type="button" title="Delete" aria-label="Delete" data-delete="${item.id}">${lxIcon("trash")}</button></div></td>
                </tr>`).join("") || lxEmpty(6, "No service yet. Add your own, or press \"Add ready-made list\".")}</tbody>
            </table></div>
          </section>
        </div>`;
      $("#siNew").addEventListener("click", () => serviceItemDialog(null, serviceItemsPage));
      $("#siStarter").addEventListener("click", () => { if (!ownerOnly()) return; addStarterServices(); serviceItemsPage(); });
      $("#app").querySelector("tbody")!.addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("button") as HTMLElement | null;
        if (!button) return;
        const item = D.serviceItems.find((entry: any) => entry.id == (button.dataset.edit || button.dataset.delete));
        if (!item) return;
        if (button.dataset.edit) serviceItemDialog(item, serviceItemsPage);
        if (button.dataset.delete && confirm("Delete this service from the list? Receipts already made keep it.")) {
          D.serviceItems = D.serviceItems.filter((entry: any) => entry !== item);
          save();
          serviceItemsPage();
        }
      });
    }

    // ---- The service sale screen: tap services to bill them, then one press for the receipt.
    // The bill stays while moving between screens, like an unfinished sale.
    let SV_CART: { key: number; itemId: any; name: string; qty: number; price: number; cost: number }[] = [];
    let SV_CATEGORY = "";
    let SV_QUERY = "";
    let SV_PAID_TYPED = false;

    function servicePosPage() {
      const categories = serviceCategories();
      if (SV_CATEGORY && !categories.includes(SV_CATEGORY)) SV_CATEGORY = "";
      $("#app").innerHTML = `
        <div class="lx sv-pos">
          <section class="card sv-items">
            <div class="hd">
              <h2>${esc(serviceLabel())}</h2>
              <div class="lx-acts">
                <a class="lx-out owner-only" href="#service-items">${lxIcon("edit")}<span>Price List</span></a>
                <a class="lx-out" href="#service-list">${lxIcon("clock")}<span>Bill List</span></a>
              </div>
            </div>
            ${D.serviceItems.length ? `
              <div class="lx-bar">
                <input class="srch" id="svSearch" value="${esc(SV_QUERY)}" placeholder="Search service" autocomplete="off">
              </div>
              <div class="sv-cats">${["", ...categories].map((name) => `<button type="button" class="${SV_CATEGORY === name ? "on" : ""}" data-category="${esc(name)}">${name ? esc(name) : "All"}</button>`).join("")}</div>
              <div class="sv-tiles" id="svTiles"></div>`
            : `<div class="sv-start">
                <p>No service yet. Add the services you do once, then each sale is a tap.</p>
                <div class="lx-acts"><button class="lx-add" type="button" id="svStarter">${lxIcon("box")}<span>Add ready-made list</span></button><button class="lx-out" type="button" id="svFirst">${lxIcon("plus")}<span>New Service</span></button></div>
                <small><span>Ready-made list</span>: <span data-no-translate>${esc(serviceKind().starter.flatMap(([, list]) => list.map(([name]) => name)).slice(0, 5).join(", "))}</span>…</small>
              </div>`}
          </section>

          <section class="card sv-bill">
            <div class="hd"><h2>Bill</h2><button class="lx-link" type="button" id="svClear" ${SV_CART.length ? "" : "hidden"}>Clear</button></div>
            <div class="two">
              <div><label>Customer Mobile${D.settings.requirePhone ? " *" : ""} <kbd>F1</kbd></label><input id="svPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="01XXXXXXXXX" ${D.settings.requirePhone ? "required" : ""}></div>
              <div><label>Customer Name</label><input id="svName" autocomplete="off" placeholder="Walk-in Customer"></div>
            </div>
            <datalist id="svNames">${[...new Set([...D.serviceItems.map((item: any) => item.name), ...serviceNames()])].map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist>
            <div id="svLines" class="sv-lines"></div>
            ${priceLocked() ? "" : `<button class="lx-link" type="button" id="svCustom">+ A service not in the list</button>`}
            <div class="sv-sum">
              <div><span>Subtotal</span><b id="svSubtotal"></b></div>
              <div><span>Discount</span><input id="svDisc" type="number" inputmode="decimal" min="0" step="0.01" value="0" ${lockAttr()}></div>
              <div class="sv-total"><span>Total</span><b id="svTotal"></b></div>
            </div>
            <div class="two">
              <div><label>Received <kbd>F4</kbd></label><input id="svPaid" type="number" inputmode="decimal" min="0" step="0.01" value="0"></div>
              <div><label>Payment Type</label><select id="svPay">${["Cash", "bKash", "Nagad", "Card"].map((type) => `<option value="${type}">${type}</option>`).join("")}</select></div>
            </div>
            <div class="lx-quick"><span>Due</span><b id="svDue"></b></div>
            <div class="two" style="margin-top:10px">
              <div><label>Date</label><input id="svDate" type="date" value="${today()}"></div>
              <div><label>Note</label><input id="svNote" autocomplete="off" placeholder="e.g. bike number"></div>
            </div>
            <button class="btn pu sv-save" type="button" id="svSave">${lxIcon("print")}<span>Save and Receipt</span><kbd>F9</kbd></button>
          </section>
          <button class="sv-jump" type="button" id="svJump" hidden><span id="svJumpText"></span><b>Bill</b></button>
        </div>`;

      const drawTiles = () => {
        const box = $("#svTiles");
        if (!box) return;
        const query = SV_QUERY.trim().toLowerCase();
        const shown = D.serviceItems.filter((item: any) => (!SV_CATEGORY || (item.category || "Other") === SV_CATEGORY) && (!query || String(item.name).toLowerCase().includes(query)));
        box.innerHTML = shown.map((item: any) => {
          const inBill = sum(SV_CART.filter((line) => line.itemId == item.id), (line) => line.qty);
          return `<button type="button" class="sv-tile ${inBill ? "in" : ""}" data-item="${item.id}">${inBill ? `<i>${+inBill.toFixed(3)}</i>` : ""}<b data-no-translate>${esc(item.name)}</b><span>${tk(item.price)}</span></button>`;
        }).join("") + `<button type="button" class="sv-tile sv-new owner-only" id="svNewTile">${lxIcon("plus")}<b>New Service</b></button>`
          + (shown.length ? "" : `<p class="sv-none">No service matches your search</p>`);
      };

      const totals = () => {
        const subtotal = money2(sum(SV_CART, (line) => line.qty * line.price));
        const disc = Math.min(subtotal, Math.max(0, money2(+$("#svDisc").value || 0)));
        return { subtotal, disc, total: money2(subtotal - disc) };
      };
      const refresh = () => {
        const { subtotal, total } = totals();
        if (!SV_PAID_TYPED) $("#svPaid").value = String(total);
        $("#svSubtotal").textContent = tk(subtotal);
        $("#svTotal").textContent = tk(total);
        $("#svDue").textContent = tk(Math.max(0, money2(total - (+$("#svPaid").value || 0))));
        // On a phone the bill is below the services: a bar at the bottom says what is in it and goes there.
        const count = sum(SV_CART, (line) => line.qty);
        $("#svJump").hidden = !SV_CART.length;
        $("#svJumpText").textContent = `${+count.toFixed(3)} · ${tk(total)}`;
        for (const line of SV_CART) {
          const amount = document.querySelector(`[data-line="${line.key}"] .sv-amt`);
          if (amount) amount.textContent = tk(line.qty * line.price);
        }
      };
      const drawLines = () => {
        $("#svLines").innerHTML = SV_CART.map((line) => `
          <div class="sv-row" data-line="${line.key}">
            ${line.itemId ? `<b class="sv-row-name" data-no-translate>${esc(line.name)}</b>` : `<input class="sv-row-name" data-field="name" list="svNames" value="${esc(line.name)}" placeholder="Service name" aria-label="Service">`}
            <div class="sv-step"><button type="button" data-step="-1" aria-label="Less">−</button><input data-field="qty" type="number" inputmode="decimal" min="0.001" step="any" value="${line.qty}" aria-label="Qty"><button type="button" data-step="1" aria-label="More">+</button></div>
            <input class="sv-row-price" data-field="price" type="number" inputmode="decimal" min="0" step="0.01" value="${line.price}" aria-label="Price" ${lockAttr()}>
            <b class="sv-amt"></b>
            <button class="lx-ic del" type="button" title="Remove" aria-label="Remove" data-remove>${lxIcon("trash")}</button>
          </div>`).join("") || `<p class="sv-empty">Tap a service on the left to add it to the bill.</p>`;
        refresh();
      };
      const redraw = () => { drawLines(); drawTiles(); const clear = $("#svClear"); if (clear) clear.hidden = !SV_CART.length; };

      drawTiles();
      drawLines();

      const add = (item: any) => {
        const line = SV_CART.find((entry) => entry.itemId == item.id && entry.price === +item.price);
        if (line) line.qty = q3(line.qty + 1);
        else SV_CART.push({ key: uid(), itemId: item.id, name: item.name, qty: 1, price: +item.price || 0, cost: +item.cost || 0 });
        redraw();
      };
      $("#svTiles")?.addEventListener("click", (event: Event) => {
        const tile = (event.target as HTMLElement).closest(".sv-tile") as HTMLElement | null;
        if (!tile) return;
        if (tile.id === "svNewTile") { serviceItemDialog(null, servicePosPage); return; }
        const item = D.serviceItems.find((entry: any) => entry.id == tile.dataset.item);
        if (item) add(item);
      });
      $("#svSearch")?.addEventListener("input", (event: Event) => { SV_QUERY = (event.currentTarget as HTMLInputElement).value; drawTiles(); });
      document.querySelectorAll(".sv-cats [data-category]").forEach((button) => button.addEventListener("click", () => {
        SV_CATEGORY = (button as HTMLElement).dataset.category || "";
        document.querySelectorAll(".sv-cats button").forEach((other) => other.classList.toggle("on", other === button));
        drawTiles();
      }));
      $("#svStarter")?.addEventListener("click", () => { if (!ownerOnly()) return; addStarterServices(); servicePosPage(); });
      $("#svFirst")?.addEventListener("click", () => serviceItemDialog(null, servicePosPage));
      $("#svCustom")?.addEventListener("click", () => {
        SV_CART.push({ key: uid(), itemId: 0, name: "", qty: 1, price: 0, cost: 0 });
        redraw();
        (document.querySelector(`[data-line="${SV_CART[SV_CART.length - 1].key}"] .sv-row-name`) as HTMLInputElement)?.focus();
      });
      $("#svClear")?.addEventListener("click", () => { SV_CART = []; SV_PAID_TYPED = false; redraw(); });

      const linesBox = $("#svLines");
      linesBox.addEventListener("input", (event: Event) => {
        const box = event.target as HTMLInputElement;
        const line = SV_CART.find((entry) => entry.key == +(box.closest("[data-line]") as HTMLElement).dataset.line!);
        if (!line) return;
        if (box.dataset.field === "name") {
          line.name = box.value;
          // A service from the list, typed by name, brings its price.
          const known = D.serviceItems.find((item: any) => String(item.name).toLowerCase() === box.value.trim().toLowerCase());
          line.cost = known ? +known.cost || 0 : 0;
          if (known && !line.price) { line.price = +known.price || 0; (box.closest("[data-line]")!.querySelector(".sv-row-price") as HTMLInputElement).value = String(line.price); }
        }
        if (box.dataset.field === "qty") line.qty = q3(+box.value || 0);
        if (box.dataset.field === "price") line.price = money2(+box.value || 0);
        refresh();
        if (box.dataset.field !== "name") drawTiles();
      });
      linesBox.addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("button") as HTMLElement | null;
        if (!button) return;
        const key = +(button.closest("[data-line]") as HTMLElement).dataset.line!;
        const line = SV_CART.find((entry) => entry.key === key);
        if (!line) return;
        if (button.dataset.remove !== undefined) SV_CART = SV_CART.filter((entry) => entry !== line);
        if (button.dataset.step) {
          line.qty = q3(line.qty + +button.dataset.step);
          if (line.qty <= 0) SV_CART = SV_CART.filter((entry) => entry !== line);
        }
        redraw();
      });
      $("#svDisc").addEventListener("input", refresh);
      $("#svJump").addEventListener("click", () => $(".sv-bill").scrollIntoView({ behavior: "smooth", block: "start" }));
      $("#svPaid").addEventListener("input", () => { SV_PAID_TYPED = true; refresh(); });
      linkCustomerPhone($("#svPhone"), $("#svName"));

      $("#svSave").addEventListener("click", () => {
        const filled = SV_CART.filter((line) => line.name.trim() || line.price);
        if (!filled.length) { toast("Tap a service to add it to the bill"); return; }
        if (filled.some((line) => !line.name.trim())) { toast("Write the name of each service"); return; }
        if (filled.some((line) => !(line.qty > 0))) { toast("Enter a quantity for each service"); return; }
        const { subtotal, disc, total } = totals();
        if (!(total > 0)) { toast("Enter the price of the service"); return; }
        const paid = Math.min(total, Math.max(0, money2(+$("#svPaid").value || 0)));

        // The customer is kept like a sale's buyer: the mobile number says who they are.
        const name = $("#svName").value.trim();
        const phone = $("#svPhone").value.trim();
        if (D.settings.requirePhone && !phone) { toast("Enter the customer's phone number"); $("#svPhone").focus(); return; }
        let customer: any = null;
        if (name || phone) {
          customer = D.customers.find((person: any) => phone
            ? phoneKey(person.phone) === phoneKey(phone)
            : !person.phone && String(person.name || "").trim().toLowerCase() === name.toLowerCase());
          if (!customer) {
            customer = { id: uid(), status: "Active", name: name || phone, phone, address: "" };
            D.customers.push(customer);
          }
        }

        const used = new Set(D.services.map((entry: any) => entry.inv));
        let number = "";
        do { D.seq++; number = `SV-${String(D.seq).padStart(5, "0")}`; } while (used.has(number));
        const id = uid();
        D.services.unshift({
          id,
          inv: number,
          kind: "service",
          date: $("#svDate").value || today(),
          time: nowTime(),
          party: customer ? customer.name : "Walk-in Customer",
          phone: customer ? customer.phone || "" : "",
          partyId: customer ? customer.id : 0,
          items: filled.map((line) => ({ name: line.name.trim(), qty: line.qty, price: line.price, cost: line.cost || 0 })),
          subtotal,
          disc,
          total,
          paid,
          due: money2(total - paid),
          pay: $("#svPay").value,
          note: $("#svNote").value.trim(),
        });
        save();
        SV_CART = [];
        SV_PAID_TYPED = false;
        toast("Service sale saved");
        servicePosPage();
        quickReceipt(id);
      });
    }

    // ---- Expenses: what the shop spends, by kind, for any period. Expenses from before kinds
    // were kept count as "Other".
    const EXPENSE_KINDS: [string, string, string][] = [
      ["Rent", "var(--bl)", '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'],
      ["Electricity", "#eab308", '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
      ["Salary", "var(--gr)", '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
      ["Transport", "#0ea5e9", '<path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>'],
      ["Tea & Snacks", "#a16207", '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3"/>'],
      ["Shop Supplies", "#8b5cf6", '<path d="m12 3 9 5v8l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>'],
      ["Internet & Phone", "#14b8a6", '<path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>'],
      ["Repair", "var(--or)", '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'],
      ["Other", "var(--mut)", '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'],
    ];
    const expenseKind = (entry: any) => EXPENSE_KINDS.find(([name]) => name === entry.category) || EXPENSE_KINDS[EXPENSE_KINDS.length - 1];
    const kindIcon = (kind: [string, string, string]) => `<i class="ex-ic" style="--c:${kind[1]}"><svg viewBox="0 0 24 24" aria-hidden="true">${kind[2]}</svg></i>`;
    const dayIso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const EX_PERIODS: [string, string, () => [string, string]][] = [
      ["today", "Today", () => [today(), today()]],
      ["week", "Last 7 Days", () => { const now = new Date(); return [dayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), today()]; }],
      ["month", "This Month", () => { const now = new Date(); return [dayIso(new Date(now.getFullYear(), now.getMonth(), 1)), today()]; }],
      ["last-month", "Last Month", () => { const now = new Date(); return [dayIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dayIso(new Date(now.getFullYear(), now.getMonth(), 0))]; }],
      ["year", "This Year", () => [dayIso(new Date(new Date().getFullYear(), 0, 1)), today()]],
      ["all", "All Time", () => ["", ""]],
    ];
    let EX_PERIOD = "month";
    let [EX_FROM, EX_TO] = EX_PERIODS[2][2]();
    let EX_KIND = "";
    let EX_QUERY = "";
    let EX_LIMIT = 25;

    function expensesPage() {
      const inRange = (date: any) => { const day = String(date || "").slice(0, 10); return (!EX_FROM || day >= EX_FROM) && (!EX_TO || day <= EX_TO); };
      const inPeriod = D.expenses.filter((entry: any) => inRange(entry.date))
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || (+b.id || 0) - (+a.id || 0));
      const total = sum(inPeriod, (entry) => entry.amount);
      const todayTotal = sum(D.expenses.filter((entry: any) => entry.date === today()), (entry) => entry.amount);
      const month = today().slice(0, 7);
      const monthTotal = sum(D.expenses.filter((entry: any) => String(entry.date).startsWith(month)), (entry) => entry.amount);
      const firstDay = EX_FROM || inPeriod[inPeriod.length - 1]?.date || today();
      const days = Math.max(1, Math.round((Date.parse(EX_TO || today()) - Date.parse(firstDay)) / 864e5) + 1);
      const byKind = EXPENSE_KINDS.map((kind) => {
        const entries = inPeriod.filter((entry: any) => expenseKind(entry) === kind);
        return { kind, count: entries.length, amount: sum(entries, (entry) => entry.amount) };
      }).filter((row) => row.count).sort((a, b) => b.amount - a.amount);
      const biggest = Math.max(1, ...byKind.map((row) => row.amount));
      const largest = [...inPeriod].sort((a: any, b: any) => (+b.amount || 0) - (+a.amount || 0)).slice(0, 5);
      const rangeText = EX_FROM || EX_TO ? `${EX_FROM || "…"} — ${EX_TO || "…"}` : said("All Time");

      $("#app").innerHTML = `
        <div class="lx ex">
          <section class="card pl-head">
            <div class="hd">
              <div><h2>Expense List</h2><small class="pl-range" data-no-translate>${esc(rangeText)}</small></div>
              <div class="lx-acts lx-noprint">
                <button class="lx-out" type="button" id="exCsv">${lxIcon("download")}<span>Excel (CSV)</span></button>
                <button class="lx-out" type="button" id="exPrint">${lxIcon("print")}<span>Print / PDF</span></button>
                <button class="lx-add" type="button" id="exAdd">${lxIcon("plus")}<span>Add Expense</span></button>
              </div>
            </div>
            <div class="pl-periods lx-noprint">
              ${EX_PERIODS.map(([key, label]) => `<button type="button" class="${EX_PERIOD === key ? "on" : ""}" data-period="${key}">${label}</button>`).join("")}
              <span class="pl-custom"><input id="exFrom" type="date" value="${EX_FROM}" aria-label="From"><span>to</span><input id="exTo" type="date" value="${EX_TO}" aria-label="To"></span>
            </div>
          </section>

          <div class="lx-kpis lx-four">
            <div class="lx-kpi pl-net loss"><em>${lxIcon("wallet")}</em><div><span>Total Expense</span><b>${tk(total)}</b><small>${inPeriod.length} expenses</small></div></div>
            ${lxKpi("clock", "Today", tk(todayTotal), "", "var(--or)")}
            ${lxKpi("trend", "This Month", tk(monthTotal), "", "var(--bl)")}
            ${lxKpi("box", "Average per Day", tk(total / days), `${days} days`, "var(--mut)")}
          </div>

          <div class="pl-grid">
            <section class="card">
              <div class="hd"><h2>By Category</h2></div>
              ${byKind.length ? byKind.map((row) => `<div class="pl-bar ex-bar"><div>${kindIcon(row.kind)}<b>${row.kind[0]}</b><em><b>${tk(row.amount)}</b></em></div><i><u style="width:${Math.max(3, (row.amount / biggest) * 100)}%;background:${row.kind[1]}"></u></i><small>${row.count} expenses · ${total ? ((row.amount / total) * 100).toFixed(1) : "0.0"}%</small></div>`).join("") : `<p class="pl-empty">No expense in this period</p>`}
            </section>
            <section class="card">
              <div class="hd"><h2>Largest Expenses</h2></div>
              ${largest.length ? largest.map((entry: any, index: number) => `<div class="ex-big"><span class="pl-rank">${index + 1}</span><div><b data-no-translate>${esc(entry.title || said(expenseKind(entry)[0]))}</b><small>${esc(entry.date)} · <span>${expenseKind(entry)[0]}</span></small></div><em>${tk(entry.amount)}</em></div>`).join("") : `<p class="pl-empty">No expense in this period</p>`}
            </section>
          </div>

          <section class="card">
            <div class="lx-bar">
              <div class="sv-cats ex-kinds">${[["", "All"], ...byKind.map((row) => [row.kind[0], row.kind[0]])].map(([key, label]) => `<button type="button" class="${EX_KIND === key ? "on" : ""}" data-kind="${esc(key)}">${label}</button>`).join("")}</div>
              <span class="sp"></span>
              <input class="srch lx-noprint" id="exSearch" value="${esc(EX_QUERY)}" placeholder="Search expense">
            </div>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>Expense</th><th>Date</th><th>Category</th><th>Payment</th><th class="num">Amount</th><th></th></tr></thead>
              <tbody id="exRows"></tbody>
              <tfoot id="exFoot"></tfoot>
            </table></div>
            <div id="exMore" class="sv-more"></div>
          </section>
        </div>`;

      let shown: any[] = [];
      const drawRows = () => {
        const query = EX_QUERY.trim().toLowerCase();
        shown = inPeriod.filter((entry: any) => (!EX_KIND || expenseKind(entry)[0] === EX_KIND)
          && (!query || `${entry.title || ""} ${entry.note || ""} ${expenseKind(entry)[0]} ${said(expenseKind(entry)[0])}`.toLowerCase().includes(query)));
        $("#exRows").innerHTML = shown.slice(0, EX_LIMIT).map((entry: any) => {
          const kind = expenseKind(entry);
          return `<tr>
            <td class="lx-main"><div class="lx-who">${kindIcon(kind)}<div><b data-no-translate>${esc(entry.title || said(kind[0]))}</b>${entry.note ? `<small class="lx-tel" data-no-translate>${esc(entry.note)}</small>` : ""}</div></div></td>
            <td ${lxLabel("Date")}>${esc(entry.date || "-")}</td>
            <td ${lxLabel("Category")}>${lxPill(kind[0], kind[1])}</td>
            <td ${lxLabel("Payment")}><span>${esc(entry.pay || "Cash")}</span></td>
            <td class="num" ${lxLabel("Amount")}><b class="lx-due">${tk(entry.amount)}</b></td>
            <td><div class="lx-acts"><button class="lx-ic" type="button" title="Edit" aria-label="Edit" data-edit="${entry.id}">${lxIcon("edit")}</button><button class="lx-ic del" type="button" title="Delete" aria-label="Delete" data-delete="${entry.id}">${lxIcon("trash")}</button></div></td>
          </tr>`;
        }).join("") || lxEmpty(6, D.expenses.length ? "No expense in this period" : "No expense yet. Press \"Add Expense\" to write the first one.");
        $("#exFoot").innerHTML = shown.length ? `<tr><th colspan="4">Total</th><th class="num">${tk(sum(shown, (entry) => entry.amount))}</th><th></th></tr>` : "";
        $("#exMore").innerHTML = shown.length > EX_LIMIT ? `<button class="lx-out" type="button" id="exShowMore">Show more</button>` : "";
        $("#exShowMore")?.addEventListener("click", () => { EX_LIMIT += 25; drawRows(); });
      };
      drawRows();

      document.querySelectorAll(".ex .pl-periods [data-period]").forEach((button) => button.addEventListener("click", () => {
        EX_PERIOD = (button as HTMLElement).dataset.period!;
        [EX_FROM, EX_TO] = EX_PERIODS.find(([key]) => key === EX_PERIOD)![2]();
        EX_LIMIT = 25;
        expensesPage();
      }));
      $("#exFrom").addEventListener("change", (event: Event) => { EX_FROM = (event.currentTarget as HTMLInputElement).value; EX_PERIOD = ""; expensesPage(); });
      $("#exTo").addEventListener("change", (event: Event) => { EX_TO = (event.currentTarget as HTMLInputElement).value; EX_PERIOD = ""; expensesPage(); });
      document.querySelectorAll(".ex-kinds [data-kind]").forEach((button) => button.addEventListener("click", () => {
        EX_KIND = (button as HTMLElement).dataset.kind || "";
        document.querySelectorAll(".ex-kinds button").forEach((other) => other.classList.toggle("on", other === button));
        EX_LIMIT = 25;
        drawRows();
      }));
      $("#exSearch").addEventListener("input", (event: Event) => { EX_QUERY = (event.currentTarget as HTMLInputElement).value; EX_LIMIT = 25; drawRows(); });
      $("#exAdd").addEventListener("click", () => expenseForm());
      $("#exPrint").addEventListener("click", () => window.print());
      $("#exCsv").addEventListener("click", () => {
        const rows = [["Date", "Expense", "Category", "Payment", "Amount", "Note"], ...shown.map((entry: any) => [entry.date, entry.title || expenseKind(entry)[0], expenseKind(entry)[0], entry.pay || "Cash", (+entry.amount || 0).toFixed(2), entry.note || ""])];
        const csv = "﻿" + rows.map((row) => row.map((value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        link.download = `expenses-${EX_FROM || "start"}-to-${EX_TO || today()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
      $("#exRows").addEventListener("click", (event: Event) => {
        const button = (event.target as HTMLElement).closest("button") as HTMLElement | null;
        const entry = button && D.expenses.find((item: any) => item.id == (button.dataset.edit || button.dataset.delete));
        if (!button || !entry) return;
        if (button.dataset.edit) expenseForm(entry);
        if (button.dataset.delete && ownerOnly() && confirm("Delete this expense?")) {
          D.expenses = D.expenses.filter((item: any) => item !== entry);
          save();
          expensesPage();
        }
      });
    }

    const expenseForm = (entry?: any) => {
      if (entry && !ownerOnly()) return;
      let kind = entry ? expenseKind(entry)[0] : "";
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg ex-dlg">
        <h3>${entry ? "Edit Expense" : "Add Expense"}</h3>
        <label>Category</label>
        <div class="ex-pick">${EXPENSE_KINDS.map((option) => `<button type="button" class="${kind === option[0] ? "on" : ""}" data-pick="${esc(option[0])}" style="--c:${option[1]}">${kindIcon(option)}<span>${option[0]}</span></button>`).join("")}</div>
        <div class="two" style="margin-top:12px">
          <div><label>Amount</label><input id="exAmount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${entry ? +entry.amount || "" : ""}" placeholder="0"></div>
          <div><label>Date</label><input id="exDate" type="date" value="${esc(entry?.date || today())}"></div>
        </div>
        <label style="margin-top:10px">Description</label><input id="exTitle" value="${esc(entry?.title || "")}" placeholder="e.g. October shop rent" autocomplete="off">
        <div class="two" style="margin-top:10px">
          <div><label>Payment Type</label><select id="exPay">${["Cash", "bKash", "Nagad", "Card", "Bank"].map((type) => `<option value="${type}" ${type === (entry?.pay || "Cash") ? "selected" : ""}>${type}</option>`).join("")}</select></div>
          <div><label>Note</label><input id="exNote" value="${esc(entry?.note || "")}" placeholder="Optional" autocomplete="off"></div>
        </div>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="exSave">Save</button>
        </div></div>`;
      dialog.showModal();
      ($("#exAmount") as HTMLInputElement).focus();
      dialog.querySelectorAll(".ex-pick [data-pick]").forEach((button) => button.addEventListener("click", () => {
        kind = (button as HTMLElement).dataset.pick!;
        dialog.querySelectorAll(".ex-pick button").forEach((other) => other.classList.toggle("on", other === button));
      }));
      $("#exSave").addEventListener("click", () => {
        const amount = money2(+$("#exAmount").value || 0);
        if (!(amount > 0)) { toast("Enter the amount spent"); $("#exAmount").focus(); return; }
        if (!kind) { toast("Choose what the money was spent on"); return; }
        const values = { date: $("#exDate").value || today(), category: kind, title: $("#exTitle").value.trim(), amount, pay: $("#exPay").value, note: $("#exNote").value.trim() };
        if (entry) Object.assign(entry, values);
        else D.expenses.unshift({ id: uid(), ...values });
        save();
        dialog.close();
        toast(entry ? "Expense saved" : "Expense added");
        expensesPage();
      });
    };

    // ---- Stock: what is on the shelves, what it is worth, and what needs buying again.
    let ST_STATE = "";
    let ST_CATEGORY = "";
    let ST_QUERY = "";
    let ST_SORT = "value";
    let ST_LIMIT = 25;

    function stocksPage() {
      // What sold in the last 30 days, to see what moves and what sits.
      const since = dayIso(new Date(Date.now() - 29 * 864e5));
      const sold = new Map<string, number>();
      for (const sale of D.sales) {
        if (sale.ret || String(sale.date) < since) continue;
        for (const item of sale.items || []) sold.set(String(item.id), (sold.get(String(item.id)) || 0) + (+item.qty || 0));
      }
      const state = (product: any) => (+product.stock || 0) <= 0 ? "out" : isLowStock(product) ? "low" : "in";
      const rows: AnyData[] = D.products.map((product: any) => ({
        product,
        qty: +product.stock || 0,
        cost: (+product.buy || 0) * Math.max(0, +product.stock || 0),
        worth: (+product.sell || 0) * Math.max(0, +product.stock || 0),
        sold: q3(sold.get(String(product.id)) || 0),
        state: state(product),
        category: nm("categories", product.category) || "",
      }));
      const costValue = sum(rows, (row) => row.cost);
      const saleValue = sum(rows, (row) => row.worth);
      const lowCount = rows.filter((row) => row.state === "low").length;
      const outCount = rows.filter((row) => row.state === "out").length;
      const units = sum(rows, (row) => Math.max(0, row.qty));

      const byCategory = new Map<string, number>();
      for (const row of rows) byCategory.set(row.category || "Other", (byCategory.get(row.category || "Other") || 0) + row.cost);
      const categories = [...byCategory.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
      const topCategory = Math.max(1, ...categories.map(([, value]) => value));
      // Out of stock first, then the ones furthest under their alert line.
      const restock = rows.filter((row) => row.state !== "in")
        .sort((a, b) => (a.qty - alertQty(a.product)) - (b.qty - alertQty(b.product)) || b.sold - a.sold).slice(0, 6);
      const STATES: [string, string, string][] = [["", "All", "var(--pu)"], ["in", "In Stock", "var(--gr)"], ["low", "Low Stock", "var(--or)"], ["out", "Out of Stock", "var(--rd)"]];
      const statePill = (row: AnyData) => row.state === "out" ? lxPill("Out of Stock", "var(--rd)") : row.state === "low" ? lxPill("Low Stock", "var(--or)") : lxPill("In Stock", "var(--gr)");
      const picture = (product: any) => typeof product.image === "string" && product.image
        ? `<img class="st-img" src="${esc(product.image)}" alt="">`
        : `<i class="lx-av" data-no-translate>${esc(([...String(product.name || "?").trim()][0] || "?").toUpperCase())}</i>`;

      $("#app").innerHTML = `
        <div class="lx st">
          <div class="lx-kpis st-kpis">
            ${lxKpi("box", "Stock Value", tk(costValue), `${rows.length} products · ${+units.toFixed(3)} units`, "var(--bl)")}
            ${lxKpi("cart", "Sale Value", tk(saleValue), "At the selling price", "var(--pu)")}
            ${lxKpi("trend", "Potential Profit", tk(saleValue - costValue), "If all of it sells", "var(--gr)")}
            <button type="button" class="lx-kpi st-kpi-btn ${ST_STATE === "low" ? "on" : ""}" data-state="low" style="--c:var(--or)"><em>${lxIcon("clock")}</em><div><span>Low Stock</span><b>${lowCount}</b><small>Tap to see them</small></div></button>
            <button type="button" class="lx-kpi st-kpi-btn ${ST_STATE === "out" ? "on" : ""}" data-state="out" style="--c:var(--rd)"><em>${lxIcon("down")}</em><div><span>Out of Stock</span><b>${outCount}</b><small>Tap to see them</small></div></button>
          </div>

          <div class="pl-grid">
            <section class="card">
              <div class="hd"><h2>Value by Category</h2></div>
              ${categories.length ? categories.slice(0, 8).map(([name, value], index) => `<div class="pl-bar"><div><span class="pl-rank">${index + 1}</span><b>${esc(name)}</b><em><b>${tk(value)}</b></em></div><i><u style="width:${Math.max(3, (value / topCategory) * 100)}%"></u></i><small>${costValue ? ((value / costValue) * 100).toFixed(1) : "0.0"}% of stock value</small></div>`).join("") : `<p class="pl-empty">No stock yet</p>`}
            </section>
            <section class="card">
              <div class="hd"><h2>Needs Restock</h2><a class="lx-link lx-noprint" href="#purchase-new">New Purchase</a></div>
              ${restock.length ? restock.map((row) => `<div class="st-need">${picture(row.product)}<div><b data-no-translate>${esc(row.product.name)}</b><small>${said("Alert at")} ${alertQty(row.product)} · ${said("Sold")} ${row.sold} / 30 ${said("days")}</small></div><span class="st-qty ${row.state}">${+row.qty.toFixed(3)}</span></div>`).join("") : `<p class="pl-empty st-ok">${lxIcon("trend")}<span>Every product has enough stock</span></p>`}
            </section>
          </div>

          <section class="card">
            <div class="hd">
              <h2>Stock List</h2>
              <div class="lx-acts lx-noprint">
                <button class="lx-out" type="button" id="stCsv">${lxIcon("download")}<span>Excel (CSV)</span></button>
                <button class="lx-out" type="button" id="stPrint">${lxIcon("print")}<span>Print / PDF</span></button>
              </div>
            </div>
            <div class="lx-bar">
              <div class="sv-cats st-states">${STATES.map(([key, label]) => `<button type="button" class="${ST_STATE === key ? "on" : ""}" data-state="${key}">${label}</button>`).join("")}</div>
              <span class="sp"></span>
              <select id="stCategory" class="st-select" aria-label="Category"><option value="">All Categories</option>${[...new Set(rows.map((row) => row.category).filter(Boolean))].sort().map((name) => `<option value="${esc(name)}" ${ST_CATEGORY === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
              <select id="stSort" class="st-select" aria-label="Sort">${[["value", "Highest value first"], ["low", "Lowest stock first"], ["sold", "Best selling first"], ["name", "Name A-Z"]].map(([key, label]) => `<option value="${key}" ${ST_SORT === key ? "selected" : ""}>${label}</option>`).join("")}</select>
              <input class="srch lx-noprint" id="stSearch" value="${esc(ST_QUERY)}" placeholder="Search product or code">
            </div>
            <div class="wrap"><table class="lx-table st-table">
              <thead><tr><th>Product</th><th>Category</th><th class="num">Cost Price</th><th class="num">Sale Price</th><th class="num">Qty</th><th class="num">Stock Value</th><th class="num">Sold (30 days)</th><th>Status</th></tr></thead>
              <tbody id="stRows"></tbody>
              <tfoot id="stFoot"></tfoot>
            </table></div>
            <div id="stMore" class="sv-more"></div>
          </section>
        </div>`;

      let shown: AnyData[] = [];
      const drawRows = () => {
        const query = ST_QUERY.trim().toLowerCase();
        shown = rows.filter((row: AnyData) => (!ST_STATE || row.state === ST_STATE) && (!ST_CATEGORY || row.category === ST_CATEGORY)
          && (!query || `${row.product.name} ${row.product.code || ""} ${row.category}`.toLowerCase().includes(query)));
        shown.sort(ST_SORT === "low" ? (a, b) => a.qty - b.qty : ST_SORT === "sold" ? (a, b) => b.sold - a.sold : ST_SORT === "name" ? (a, b) => String(a.product.name).localeCompare(String(b.product.name)) : (a, b) => b.cost - a.cost);
        $("#stRows").innerHTML = shown.slice(0, ST_LIMIT).map((row) => {
          const product = row.product;
          const unit = nm("units", product.unit);
          return `<tr class="${row.state === "out" ? "st-out" : ""}">
            <td class="lx-main"><div class="lx-who">${picture(product)}<div><b data-no-translate>${esc(product.name)}</b>${product.code || sizeList(product).length ? `<small class="lx-tel" data-no-translate>${esc([product.code, sizeSummary(product)].filter(Boolean).join(" · "))}</small>` : ""}</div></div></td>
            <td ${lxLabel("Category")}><span>${esc(row.category || "-")}</span></td>
            <td class="num" ${lxLabel("Cost Price")}>${tk(product.buy)}</td>
            <td class="num" ${lxLabel("Sale Price")}>${tk(product.sell)}</td>
            <td class="num" ${lxLabel("Qty")}><span class="st-qty ${row.state}">${+row.qty.toFixed(3)}</span>${unit ? ` <small class="lx-none">${esc(unit)}</small>` : ""}</td>
            <td class="num" ${lxLabel("Stock Value")}><b>${tk(row.cost)}</b></td>
            <td class="num" ${lxLabel("Sold (30 days)")}>${row.sold ? `<span>${row.sold}</span>` : `<span class="lx-none">0</span>`}</td>
            <td ${lxLabel("Status")}>${statePill(row)}</td>
          </tr>`;
        }).join("") || lxEmpty(8, D.products.length ? "No product matches" : "No product yet. Add products to see their stock here.");
        $("#stFoot").innerHTML = shown.length ? `<tr><th colspan="4">Total</th><th class="num">${+sum(shown, (row) => Math.max(0, row.qty)).toFixed(3)}</th><th class="num">${tk(sum(shown, (row) => row.cost))}</th><th class="num">${+sum(shown, (row) => row.sold).toFixed(3)}</th><th></th></tr>` : "";
        $("#stMore").innerHTML = shown.length > ST_LIMIT ? `<button class="lx-out" type="button" id="stShowMore">Show more</button>` : "";
        $("#stShowMore")?.addEventListener("click", () => { ST_LIMIT += 25; drawRows(); });
      };
      drawRows();

      // The state chips and the low / out cards filter the list and move to it.
      document.querySelectorAll(".st [data-state]").forEach((button) => button.addEventListener("click", () => {
        const picked = (button as HTMLElement).dataset.state || "";
        ST_STATE = button.classList.contains("st-kpi-btn") && ST_STATE === picked ? "" : picked;
        ST_LIMIT = 25;
        stocksPage();
        if (button.classList.contains("st-kpi-btn")) $("#stRows").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      $("#stCategory").addEventListener("change", (event: Event) => { ST_CATEGORY = (event.currentTarget as HTMLSelectElement).value; ST_LIMIT = 25; drawRows(); });
      $("#stSort").addEventListener("change", (event: Event) => { ST_SORT = (event.currentTarget as HTMLSelectElement).value; drawRows(); });
      $("#stSearch").addEventListener("input", (event: Event) => { ST_QUERY = (event.currentTarget as HTMLInputElement).value; ST_LIMIT = 25; drawRows(); });
      $("#stPrint").addEventListener("click", () => window.print());
      $("#stCsv").addEventListener("click", () => {
        const table = [["Product", "Code", "Category", "Cost", "Sale", "Qty", "Stock Value", "Sold (30 days)", "Status", "Sizes"],
          ...shown.map((row) => [row.product.name, row.product.code || "", row.category, (+row.product.buy || 0).toFixed(2), (+row.product.sell || 0).toFixed(2), row.qty, row.cost.toFixed(2), row.sold, row.state === "out" ? "Out of Stock" : row.state === "low" ? "Low Stock" : "In Stock", sizeSummary(row.product)])];
        const csv = "﻿" + table.map((line) => line.map((value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        link.download = `stock-${today()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
    }

    function peoplePage(k: PeopleList) {
      const forCustomers = k === "customers";
      const title = C[k][0];
      const bought = forCustomers ? "Total Sales" : "Total Purchase";
      // "Walk-in Customer" is only the name given to a sale made to nobody in particular.
      const people: AnyData[] = D[k].filter((person: any) => String(person.name || "").trim().toLowerCase() !== "walk-in customer")
        .map((person: any) => ({ person, ...personTotals(k, person) }));
      const owing = people.filter((row) => row.due > 0);

      $("#app").innerHTML = `
        <div class="lx">
          <div class="lx-kpis">
            ${lxKpi("people", forCustomers ? "Total Customer" : "Total Supplier", String(people.length), "", "var(--pu)")}
            ${lxKpi(forCustomers ? "cart" : "truck", bought, tk(sum(people, (row) => row.total)), "", "var(--bl)")}
            ${lxKpi("wallet", "Total Due", tk(sum(people, (row) => row.due)), `${owing.length} ${forCustomers ? "customers" : "suppliers"}`, forCustomers ? "var(--gr)" : "var(--rd)")}
          </div>
          <section class="card">
            <div class="hd">
              <h2>${title} List</h2>
              <div class="lx-acts lx-noprint">
                <button class="lx-out" type="button" onclick="window.print()">${lxIcon("print")}<span>Print</span></button>
                <button class="lx-add" type="button" id="addPerson">${lxIcon("plus")}<span>Add new ${title}</span></button>
              </div>
            </div>
            <div class="lx-bar"><input class="srch" id="peopleSearch" value="${esc(PEOPLE_QUERY)}" placeholder="Search by name or phone"></div>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>${title}</th><th>Address</th><th class="num">Invoices</th><th class="num">${bought}</th><th class="num">Due</th><th></th></tr></thead>
              <tbody id="peopleRows"></tbody>
            </table></div>
          </section>
        </div>`;

      const drawRows = () => {
        const query = PEOPLE_QUERY.trim().toLowerCase();
        $("#peopleRows").innerHTML = people
          .filter((row) => `${row.person.name} ${row.person.phone || ""}`.toLowerCase().includes(query))
          .map((row) => `
            <tr>
              <td class="lx-main">${lxWho(row.person.name, row.person.phone || "")}</td>
              <td class="${row.person.address ? "" : "lx-hide"}" ${lxLabel("Address")}><span data-no-translate>${esc(row.person.address || "-")}</span></td>
              <td class="num" ${lxLabel("Invoices")}>${row.invoices.length}</td>
              <td class="num" ${lxLabel(bought)}>${tk(row.total)}</td>
              <td class="num" ${lxLabel("Due")}>${row.due > 0 ? `<b class="lx-due">${tk(row.due)}</b>` : row.invoices.length ? lxPill("Paid", "var(--gr)") : `<span class="lx-none">-</span>`}</td>
              <td><div class="lx-acts">
                ${row.due > 0 ? `<button class="lx-go" type="button" data-pay="${row.person.id}">${forCustomers ? "Receive Payment" : "Pay"}</button>` : ""}
                <button class="lx-ic" type="button" title="View" aria-label="View" data-view="${row.person.id}">${lxIcon("eye")}</button>
                <button class="lx-ic" type="button" title="Edit" aria-label="Edit" data-edit="${row.person.id}">${lxIcon("edit")}</button>
                <button class="lx-ic del" type="button" title="Delete" aria-label="Delete" data-delete="${row.person.id}">${lxIcon("trash")}</button>
              </div></td>
            </tr>`).join("")
          || lxEmpty(6, "No data yet");
      };
      drawRows();

      $("#peopleSearch").addEventListener("input", (event: Event) => { PEOPLE_QUERY = (event.currentTarget as HTMLInputElement).value; drawRows(); });
      $("#addPerson").addEventListener("click", () => personForm(k));
      $("#peopleRows").addEventListener("click", (event: Event) => {
        const data = ((event.target as HTMLElement).closest("button") as HTMLElement | null)?.dataset;
        if (!data) return;
        const row = people.find((entry) => entry.person.id == (data.pay || data.view || data.edit || data.delete));
        if (!row) return;
        if (data.pay) duePaymentDialog(personOwing(row.person, row), forCustomers);
        if (data.view) personDialog(k, row.person);
        if (data.edit) personForm(k, row.person);
        if (data.delete) {
          if (row.due > 0) toast(forCustomers ? "Collect the due before deleting this customer" : "Pay the due before deleting this supplier");
          else del(k, row.person.id);
        }
      });
    }

    const personForm = (k: PeopleList, person?: any) => {
      if (person && !ownerOnly()) return;
      const title = C[k][0];
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>${person ? `Edit ${title}` : `Add new ${title}`}</h3>
        <label>Name</label><input id="personName" value="${esc(person?.name || "")}" placeholder="Enter the name">
        <label>Phone</label><input id="personPhone" type="tel" inputmode="tel" value="${esc(person?.phone || "")}" placeholder="01XXXXXXXXX">
        <label>Address</label><input id="personAddress" value="${esc(person?.address || "")}" placeholder="Optional">
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="savePerson">Save</button>
        </div></div>`;
      dialog.showModal();
      $("#personName").focus();
      $("#savePerson").addEventListener("click", () => {
        const name = $("#personName").value.trim();
        const phone = $("#personPhone").value.trim();
        if (!name) { toast("Enter the name"); return; }
        if (phone && D[k].some((other: any) => other.id !== person?.id && String(other.phone || "").trim() === phone)) { toast("This phone number is already saved"); return; }
        const details = { name, phone, address: $("#personAddress").value.trim() };
        if (person) {
          // Their invoices are found by name and phone, so they have to follow the change.
          for (const entry of personInvoices(k, person)) Object.assign(entry, { partyId: person.id, party: name, phone });
          Object.assign(person, details);
        } else {
          D[k].push({ id: uid(), status: "Active", ...details });
        }
        save();
        dialog.close();
        render();
        toast(title + " saved");
      });
    };

    const personDialog = (k: PeopleList, person: any) => {
      const forCustomers = k === "customers";
      const totals = personTotals(k, person);
      const invoices = [...totals.invoices].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      const figure = (label: string, amount: number, color = "") => `<div><span>${label}</span><b ${color ? `style="color:${color}"` : ""}>${tk(amount)}</b></div>`;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>${C[k][0]} Details</h3>
        ${lxDialogHead(person.name, person.phone || "", person.address || "")}
        <div class="lx-figs">
          ${figure(forCustomers ? "Total Sales" : "Total Purchase", totals.total)}
          ${figure("Total Paid", totals.paid, "var(--gr)")}
          ${figure("Total Due", totals.due, totals.due > 0 ? "var(--rd)" : "")}
        </div>
        <div class="wrap lx-scroll"><table class="lx-mini">
          <thead><tr><th>Invoice</th><th>Date</th><th class="num">Total</th><th class="num">Due</th><th>Status</th></tr></thead>
          <tbody>${invoices.map((entry: any) => `
            <tr><td>${forCustomers ? `<button class="lx-link" type="button" data-invoice="${entry.id}">${esc(entry.inv)}</button>` : esc(entry.inv)}</td><td>${esc(entry.date)}</td><td class="num">${tk(entry.total)}</td><td class="num">${tk(entry.ret ? 0 : entry.due)}</td><td>${entry.ret ? lxPill("Returned", "var(--mut)") : +entry.due > 0 ? lxPill("Due", "var(--rd)") : lxPill("Paid", "var(--gr)")}</td></tr>`).join("")
            || lxEmpty(5, "No data yet")}
          </tbody>
        </table></div>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Close</button>
          ${totals.due > 0 ? `<button class="btn pu" type="button" id="personPay" autofocus>${forCustomers ? "Receive Payment" : "Pay"}</button>` : `<button class="btn pu" type="button" id="personEdit" autofocus>Edit</button>`}
        </div></div>`;
      dialog.showModal();
      dialog.querySelectorAll("[data-invoice]").forEach((button) => button.addEventListener("click", () => openInvoice(+(button as HTMLElement).dataset.invoice!)));
      $("#personPay")?.addEventListener("click", () => duePaymentDialog(personOwing(person, totals), forCustomers));
      $("#personEdit")?.addEventListener("click", () => personForm(k, person));
    };

    // ---- Employees and their attendance: one register for each day, and each person's month.
    let ATTENDANCE_DATE = "";
    const ATTENDANCE_STATES: [string, string, string][] = [["present", "Present", "var(--gr)"], ["absent", "Absent", "var(--rd)"], ["leave", "Leave", "var(--or)"]];
    const nowTime = () => new Date().toTimeString().slice(0, 5);
    const attendanceOn = (employeeId: any, date: string) => D.attendance.find((record: any) => record.employee == employeeId && record.date === date);
    const setAttendance = (employeeId: any, date: string, change: AnyData) => {
      let record = attendanceOn(employeeId, date);
      if (!record) {
        record = { id: uid(), employee: employeeId, date, status: "", in: "", out: "" };
        D.attendance.push(record);
      }
      Object.assign(record, change);
      // A time in or out means the person came; someone marked away has no times.
      if (change.status === undefined && (record.in || record.out)) record.status = "present";
      if (change.status && change.status !== "present") Object.assign(record, { in: "", out: "" });
      // Nothing left to say about the day, so the day goes back to "not marked".
      if (!record.status && !record.in && !record.out) D.attendance = D.attendance.filter((entry: any) => entry !== record);
      save();
    };
    // "8:30" for eight and a half hours between coming and going; "-" until both are known.
    const hoursWorked = (record: any) => {
      if (!record?.in || !record?.out) return "-";
      const minutes = (time: string) => +time.slice(0, 2) * 60 + +time.slice(3, 5);
      const worked = minutes(record.out) - minutes(record.in);
      return worked > 0 ? `${Math.floor(worked / 60)}:${String(worked % 60).padStart(2, "0")}` : "-";
    };
    const monthAttendance = (employeeId: any, month: string) => {
      const records = D.attendance.filter((record: any) => record.employee == employeeId && String(record.date).startsWith(month))
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      const count = (status: string) => records.filter((record: any) => record.status === status).length;
      return { records, present: count("present"), absent: count("absent"), leave: count("leave") };
    };
    const statePill = (status: string) => {
      const state = ATTENDANCE_STATES.find(([key]) => key === status);
      return state ? lxPill(state[1], state[2]) : `<span class="lx-none">Not marked</span>`;
    };

    function employeesPage() {
      const date = ATTENDANCE_DATE || today();
      const isToday = date === today();
      const month = date.slice(0, 7);
      const staff: AnyData[] = D.employees.map((employee: any) => ({ employee, day: attendanceOn(employee.id, date), ...monthAttendance(employee.id, month) }));
      const marked = (status: string) => staff.filter((row) => row.day?.status === status).length;

      $("#app").innerHTML = `
        <div class="lx">
          <div class="lx-kpis lx-four">
            ${lxKpi("people", "Total Employee", String(staff.length), "", "var(--pu)")}
            ${lxKpi("clock", "Present", String(marked("present")), "", "var(--gr)")}
            ${lxKpi("clock", "Absent", String(marked("absent")), "", "var(--rd)")}
            ${lxKpi("wallet", "Monthly Salary", tk(sum(staff, (row) => +row.employee.salary || 0)), "", "var(--bl)")}
          </div>
          <section class="card">
            <div class="hd">
              <h2>Employee List</h2>
              <div class="lx-acts lx-noprint">
                <button class="lx-out" type="button" onclick="window.print()">${lxIcon("print")}<span>Print</span></button>
                <button class="lx-add" type="button" id="addEmployee">${lxIcon("plus")}<span>Add new Employee</span></button>
              </div>
            </div>
            <div class="lx-bar">
              <label class="lx-date"><span>Attendance for</span><input id="attendanceDate" type="date" value="${esc(date)}" max="${today()}"></label>
              <span class="sp"></span>
              ${staff.some((row) => !row.day?.status) ? `<button class="lx-out lx-noprint" type="button" id="restAbsent">Mark the rest absent</button>` : ""}
            </div>
            <div class="wrap"><table class="lx-table">
              <thead><tr><th>Employee</th><th>Status</th><th>Time In</th><th>Time Out</th><th class="num">Hours</th><th>This Month</th><th></th></tr></thead>
              <tbody id="employeeRows">${staff.map((row) => {
                const id = row.employee.id;
                const timeBox = (which: "in" | "out", label: string) => `
                  <span class="lx-time"><input type="time" data-time="${which}" data-employee="${id}" value="${esc(row.day?.[which] || "")}" aria-label="${label}">
                  ${isToday && !row.day?.[which] ? `<button class="lx-now" type="button" data-now="${which}" data-employee="${id}">Now</button>` : ""}</span>`;
                return `
                <tr>
                  <td class="lx-main"><div class="lx-who">${lxAvatar(row.employee.name)}<div><b data-no-translate>${esc(row.employee.name)}</b><small class="lx-tel" data-no-translate>${esc([row.employee.role, tk(row.employee.salary)].filter(Boolean).join(" · "))}</small></div></div></td>
                  <td ${lxLabel("Status")}><select class="lx-state" data-status="${id}" aria-label="Status"><option value="">Not marked</option>${ATTENDANCE_STATES.map(([key, label]) => `<option value="${key}" ${row.day?.status === key ? "selected" : ""}>${label}</option>`).join("")}</select></td>
                  <td ${lxLabel("Time In")}>${timeBox("in", "Time In")}</td>
                  <td ${lxLabel("Time Out")}>${timeBox("out", "Time Out")}</td>
                  <td class="num" ${lxLabel("Hours")}><span data-no-translate>${hoursWorked(row.day)}</span></td>
                  <td ${lxLabel("This Month")}><span class="lx-when">${lxPill(`Present ${row.present}`, "var(--gr)")}${lxPill(`Absent ${row.absent}`, "var(--rd)")}</span></td>
                  <td><div class="lx-acts">
                    <button class="lx-ic" type="button" title="View" aria-label="View" data-sheet="${id}">${lxIcon("eye")}</button>
                    <button class="lx-ic" type="button" title="Edit" aria-label="Edit" data-edit="${id}">${lxIcon("edit")}</button>
                    <button class="lx-ic del" type="button" title="Delete" aria-label="Delete" data-delete="${id}">${lxIcon("trash")}</button>
                  </div></td>
                </tr>`;
              }).join("") || lxEmpty(7, "No data yet")}</tbody>
            </table></div>
          </section>
        </div>`;

      $("#attendanceDate").addEventListener("change", (event: Event) => {
        ATTENDANCE_DATE = (event.currentTarget as HTMLInputElement).value || today();
        employeesPage();
      });
      $("#addEmployee").addEventListener("click", () => employeeForm());
      $("#restAbsent")?.addEventListener("click", () => {
        staff.filter((row) => !row.day?.status).forEach((row) => setAttendance(row.employee.id, date, { status: "absent" }));
        employeesPage();
      });
      const rows = $("#employeeRows");
      rows.addEventListener("change", (event: Event) => {
        const field = event.target as HTMLInputElement | HTMLSelectElement;
        if (field.dataset.status) setAttendance(field.dataset.status, date, { status: field.value });
        else if (field.dataset.time) setAttendance(field.dataset.employee, date, { [field.dataset.time]: field.value });
        else return;
        employeesPage();
      });
      rows.addEventListener("click", (event: Event) => {
        const data = ((event.target as HTMLElement).closest("button") as HTMLElement | null)?.dataset;
        if (!data) return;
        const employee = D.employees.find((entry: any) => entry.id == (data.employee || data.sheet || data.edit || data.delete));
        if (!employee) return;
        if (data.now) { setAttendance(employee.id, date, { [data.now]: nowTime() }); employeesPage(); }
        if (data.sheet) employeeSheet(employee, month);
        if (data.edit) employeeForm(employee);
        if (data.delete) {
          del("employees", employee.id);
          // Their attendance goes with them.
          if (!D.employees.some((entry: any) => entry.id == employee.id) && D.attendance.some((record: any) => record.employee == employee.id)) {
            D.attendance = D.attendance.filter((record: any) => record.employee != employee.id);
            save();
          }
        }
      });
    }

    const employeeForm = (employee?: any) => {
      if (employee && !ownerOnly()) return;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>${employee ? "Edit Employee" : "Add new Employee"}</h3>
        <label>Name</label><input id="employeeName" value="${esc(employee?.name || "")}" placeholder="Enter the name">
        <div class="two">
          <div><label>Phone</label><input id="employeePhone" type="tel" inputmode="tel" value="${esc(employee?.phone || "")}" placeholder="01XXXXXXXXX"></div>
          <div><label>Role</label><input id="employeeRole" value="${esc(employee?.role || "")}" placeholder="EX: Salesman"></div>
        </div>
        <div class="two">
          <div><label>Monthly Salary</label><input id="employeeSalary" type="number" min="0" step="any" inputmode="decimal" value="${employee ? +employee.salary || 0 : ""}"></div>
          <div><label>Joining Date</label><input id="employeeJoined" type="date" value="${esc(employee?.joined || "")}"></div>
        </div>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Cancel</button>
          <button class="btn pu" type="button" id="saveEmployee">Save</button>
        </div></div>`;
      dialog.showModal();
      $("#employeeName").focus();
      $("#saveEmployee").addEventListener("click", () => {
        const name = $("#employeeName").value.trim();
        if (!name) { toast("Enter the name"); return; }
        const details = { name, phone: $("#employeePhone").value.trim(), role: $("#employeeRole").value.trim(), salary: Math.max(0, +$("#employeeSalary").value || 0), joined: $("#employeeJoined").value };
        if (employee) Object.assign(employee, details);
        else D.employees.push({ id: uid(), status: "Active", ...details });
        save();
        dialog.close();
        render();
        toast("Employee saved");
      });
    };

    // One person's month: the days they came, were away or on leave, and what the absences cost.
    const employeeSheet = (employee: any, month: string) => {
      const sheet = monthAttendance(employee.id, month);
      const [year, monthNumber] = month.split("-").map(Number);
      const daysInMonth = new Date(year, monthNumber, 0).getDate();
      const salary = +employee.salary || 0;
      const cut = money2((salary / daysInMonth) * sheet.absent);
      const figure = (label: string, value: string, color = "") => `<div><span>${label}</span><b ${color ? `style="color:${color}"` : ""}>${value}</b></div>`;
      const dialog = $("#dlg") as HTMLDialogElement;
      dialog.innerHTML = `<div class="lx-dlg">
        <h3>Attendance</h3>
        <div class="lx-head">${lxAvatar(employee.name)}<div><b data-no-translate>${esc(employee.name)}</b><small data-no-translate>${esc([employee.role, employee.phone].filter(Boolean).join(" · "))}</small></div></div>
        <label>Month</label><input id="sheetMonth" type="month" value="${esc(month)}" max="${today().slice(0, 7)}">
        <div class="lx-figs" style="margin-top:12px">
          ${figure("Present", String(sheet.present), "var(--gr)")}
          ${figure("Absent", String(sheet.absent), sheet.absent ? "var(--rd)" : "")}
          ${figure("Leave", String(sheet.leave))}
        </div>
        <div class="lx-figs">
          ${figure("Monthly Salary", tk(salary))}
          ${figure("Cut for absence", tk(cut), cut ? "var(--rd)" : "")}
          ${figure("Payable", tk(Math.max(0, salary - cut)), "var(--gr)")}
        </div>
        <div class="wrap lx-scroll"><table class="lx-mini">
          <thead><tr><th>Date</th><th>Status</th><th>Time In</th><th>Time Out</th><th class="num">Hours</th></tr></thead>
          <tbody>${sheet.records.map((record: any) => `<tr><td>${esc(record.date)}</td><td>${statePill(record.status)}</td><td>${esc(record.in || "-")}</td><td>${esc(record.out || "-")}</td><td class="num">${hoursWorked(record)}</td></tr>`).join("") || lxEmpty(5, "No data yet")}</tbody>
        </table></div>
        <div class="two" style="margin-top:16px">
          <button class="btn or" type="button" onclick="document.querySelector('#dlg').close()">Close</button>
          <button class="btn pu" type="button" onclick="window.print()">Print</button>
        </div></div>`;
      if (!dialog.open) dialog.showModal();
      $("#sheetMonth").addEventListener("change", (event: Event) => employeeSheet(employee, (event.currentTarget as HTMLInputElement).value || month));
    };

    // Shown on the dashboard to the owner of a shop that is still being set up.
    const startCard = () => {
      if (!isWorkspaceOwner || D.settings.guideHidden) return "";
      const items: [string, string, boolean][] = [
        ["Choose your type of business", "settings-general", Boolean(D.settings.businessType)],
        ["Enter your shop's phone number and address", "settings-general", Boolean(D.user.phone && D.user.address)],
        ["Add your first product", "product-add", D.products.length > 0],
        ["Make your first sale", "sale-new", D.sales.length > 0],
      ];
      if (items.every((item) => item[2])) return "";
      return `<section class="card start-card"><h3>Get your shop ready</h3><ol>${items.map(([text, route, done]) => `<li class="${done ? "done" : ""}"><span aria-hidden="true">${done ? "✔" : "○"}</span>${done ? text : `<a href="#${route}">${text}</a>`}</li>`).join("")}</ol><p><a href="#help">Read the full guide</a> · <button type="button" onclick="hideStartCard()">Hide this</button></p></section>`;
    };

    const P: AnyData = {
      help: helpPage,
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
      "admin-drive": drivePage,

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
          ) - E + sum(ms(D.services), (s) => s.total - serviceCost(s));

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
            "Service Income",
            tk(sum(ms(D.services), (s) => s.total)),
            "#0ea5e9",
            "🧰",
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

        // Each card opens the list its number comes from.
        const STAT_PAGES: Record<string, string> = {
          "Total Sales": "sales",
          "Total Purchase": "purchases",
          "Total Expense": "expenses",
          "Total Customer": "customers",
          "Total Supplier": "suppliers",
          "Sales Returns": "sale-returns",
          "Net Profit": "profit",
          "Purchase Returns": "purchase-returns",
          "Service Income": "service-list",
          "Today's Courier Orders": "sales",
        };

        $("#app").innerHTML = `
          ${startCard()}
          <div class="stats">

            ${cs
              .map(
                (c) => `
                  <div class="stat-link" role="link" tabindex="0" onclick="location.hash='${STAT_PAGES[c[0]]}'" onkeydown="if(event.key==='Enter')location.hash='${STAT_PAGES[c[0]]}'">

                    <span>${c[0] === "Service Income" ? esc(serviceLabel()) : c[0]}</span>

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
                      ${c[0] === "Total Sales" ? '<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 13h8"/><path d="M9 16h.01M15 16h.01"/></svg>' : c[0] === "Total Purchase" ? '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 11.5a2 2 0 0 0 2 1.5h8.9a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>' : c[0] === "Total Expense" ? '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' : c[0] === "Total Customer" || c[0] === "Total Supplier" ? '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></svg>' : c[0] === "Sales Returns" || c[0] === "Purchase Returns" ? '<svg viewBox="0 0 24 24"><path d="M3 10V5h5M4 5a9 9 0 1 1-1 9"/><path d="m8 12 4-4 4 4M12 8v9"/></svg>' : c[0] === "Service Income" ? '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>' : c[0] === "Net Profit" ? '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M7 15h4M16 13v4M14 15h4"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>'}
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

      stocks: stocksPage,

      dues: duesPage,
      expenses: expensesPage,
      services: servicePosPage,
      "service-list": servicesPage,
      "service-items": serviceItemsPage,
      employees: employeesPage,
      customers: () => peoplePage("customers"),
      suppliers: () => peoplePage("suppliers"),

      profit: () => {
        // A profit and loss statement for a chosen period: what was sold, what those goods
        // cost, the expenses, and what is left. Returned invoices earn nothing, so they are
        // shown but kept out of every figure.
        const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const now = new Date();
        const PERIODS: [string, string, () => [string, string]][] = [
          ["today", "Today", () => [today(), today()]],
          ["yesterday", "Yesterday", () => { const day = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)); return [day, day]; }],
          ["week", "Last 7 Days", () => [iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), today()]],
          ["month", "This Month", () => [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today()]],
          ["last-month", "Last Month", () => [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))]],
          ["year", "This Year", () => [iso(new Date(now.getFullYear(), 0, 1)), today()]],
          ["all", "All Time", () => ["", ""]],
        ];
        let period = "month";
        let [from, to] = PERIODS[3][2]();
        let view: "invoice" | "product" | "daily" = "invoice";
        let query = "";
        let pageSize = 10;
        let page = 1;

        const inRange = (date: any) => { const day = String(date || "").slice(0, 10); return (!from || day >= from) && (!to || day <= to); };
        const marginOf = (profit: number, sales: number) => (sales ? (profit / sales) * 100 : 0);
        const signed = (amount: number) => `<b class="${amount < 0 ? "pl-neg" : "pl-pos"}">${tk(amount)}</b>`;
        const marginPill = (profit: number, sales: number) => sales ? lxPill(`${marginOf(profit, sales).toFixed(1)}%`, profit < 0 ? "var(--rd)" : "var(--gr)") : `<span class="lx-none">-</span>`;
        let scope: "shop" | "service" = "shop";
        let sview: "bill" | "service" | "daily" | "customer" = "bill";

        // ---- The service side of the business on its own: what the bills brought in, what the
        // work cost (material, labour), what is left, and who still owes.
        const drawServices = () => {
          const bills = D.services.filter((entry: any) => inRange(entry.date))
            .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || String(b.inv).localeCompare(String(a.inv)));
          const billed = sum(bills, (entry) => +(entry.subtotal ?? entry.total) || 0);
          const discount = sum(bills, (entry) => entry.disc);
          const income = sum(bills, (entry) => entry.total);
          const costs = sum(bills, serviceCost);
          const profit = income - costs;
          const received = sum(bills, (entry) => entry.paid);
          const owed = sum(bills, (entry) => entry.due);
          const uncosted = bills.some((entry: any) => (entry.items || []).some((item: any) => !(+item.cost > 0)));

          const byService = new Map<string, AnyData>();
          for (const entry of bills) for (const item of entry.items || []) {
            const key = String(item.name || "").trim().toLowerCase();
            const row = byService.get(key) || { name: String(item.name || "").trim(), qty: 0, income: 0, cost: 0, bills: new Set() };
            row.qty += +item.qty || 0;
            row.income += (+item.price || 0) * (+item.qty || 0);
            row.cost += (+item.cost || 0) * (+item.qty || 0);
            row.bills.add(entry.inv);
            byService.set(key, row);
          }
          const services = [...byService.values()].sort((a, b) => (b.income - b.cost) - (a.income - a.cost));
          const byDay = new Map<string, AnyData>();
          for (const entry of bills) {
            const row = byDay.get(entry.date) || { date: entry.date, bills: 0, income: 0, cost: 0, paid: 0, due: 0 };
            row.bills++; row.income += +entry.total || 0; row.cost += serviceCost(entry); row.paid += +entry.paid || 0; row.due += +entry.due || 0;
            byDay.set(entry.date, row);
          }
          const days = [...byDay.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
          const byCustomer = new Map<string, AnyData>();
          for (const entry of bills) {
            const key = entry.partyId ? `id:${entry.partyId}` : `walk-in`;
            const row = byCustomer.get(key) || { name: entry.partyId ? entry.party : said("Walk-in Customer"), phone: entry.partyId ? entry.phone || "" : "", bills: 0, income: 0, paid: 0, due: 0 };
            row.bills++; row.income += +entry.total || 0; row.paid += +entry.paid || 0; row.due += +entry.due || 0;
            byCustomer.set(key, row);
          }
          const customers = [...byCustomer.values()].sort((a, b) => b.income - a.income);

          const needle = query.trim().toLowerCase();
          const rows: AnyData[] = sview === "bill"
            ? bills.filter((entry: any) => !needle || `${entry.inv} ${entry.party} ${entry.phone} ${(entry.items || []).map((item: any) => item.name).join(" ")}`.toLowerCase().includes(needle))
            : sview === "service" ? services.filter((row) => !needle || row.name.toLowerCase().includes(needle))
              : sview === "daily" ? days.filter((row) => !needle || String(row.date).includes(needle))
                : customers.filter((row) => !needle || `${row.name} ${row.phone}`.toLowerCase().includes(needle));
          const pages = Math.max(1, Math.ceil(rows.length / pageSize));
          page = Math.min(page, pages);
          const visible = rows.slice((page - 1) * pageSize, page * pageSize);
          const status = (entry: any) => +entry.due > 0 ? lxPill("Due", "var(--rd)") : lxPill("Paid", "var(--gr)");
          const money = (amount: number, red = false) => red && amount > 0 ? `<b class="lx-due">${tk(amount)}</b>` : tk(amount);

          const table = sview === "bill" ? {
            heads: ["Receipt", "Date", "Customer", "Service", "Income", "Cost", "Profit", "Status"],
            body: visible.map((entry) => `<tr><td class="lx-main"><b data-no-translate>${esc(entry.inv)}</b></td><td ${lxLabel("Date")}>${esc(entry.date)}</td><td ${lxLabel("Customer")}><span data-no-translate>${esc(entry.partyId ? entry.party : said("Walk-in Customer"))}</span></td><td ${lxLabel("Service")}><span class="sv-names" data-no-translate>${esc((entry.items || []).map((item: any) => +item.qty === 1 ? item.name : `${item.name} × ${+item.qty}`).join(", "))}</span></td><td class="num" ${lxLabel("Income")}>${tk(entry.total)}</td><td class="num" ${lxLabel("Cost")}>${tk(serviceCost(entry))}</td><td class="num" ${lxLabel("Profit")}>${signed((+entry.total || 0) - serviceCost(entry))}</td><td ${lxLabel("Status")}>${status(entry)}</td></tr>`).join(""),
            foot: `<th colspan="4">Total</th><th class="num">${tk(sum(rows, (entry) => entry.total))}</th><th class="num">${tk(sum(rows, serviceCost))}</th><th class="num">${tk(sum(rows, (entry) => (+entry.total || 0) - serviceCost(entry)))}</th><th></th>`,
            csv: () => [["Receipt", "Date", "Customer", "Phone", "Service", "Income", "Cost", "Profit", "Paid", "Due"], ...rows.map((entry) => [entry.inv, entry.date, entry.partyId ? entry.party : "Walk-in Customer", entry.phone || "", (entry.items || []).map((item: any) => `${item.name} x ${item.qty}`).join("; "), (+entry.total || 0).toFixed(2), serviceCost(entry).toFixed(2), ((+entry.total || 0) - serviceCost(entry)).toFixed(2), (+entry.paid || 0).toFixed(2), (+entry.due || 0).toFixed(2)])],
          } : sview === "service" ? {
            heads: ["Service", "Qty", "Bills", "Income", "Cost", "Profit", "Margin"],
            body: visible.map((row) => `<tr><td class="lx-main"><b data-no-translate>${esc(row.name)}</b></td><td class="num" ${lxLabel("Qty")}>${+row.qty.toFixed(3)}</td><td class="num" ${lxLabel("Bills")}>${row.bills.size}</td><td class="num" ${lxLabel("Income")}>${tk(row.income)}</td><td class="num" ${lxLabel("Cost")}>${tk(row.cost)}</td><td class="num" ${lxLabel("Profit")}>${signed(row.income - row.cost)}</td><td class="num" ${lxLabel("Margin")}>${marginPill(row.income - row.cost, row.income)}</td></tr>`).join(""),
            foot: "",
            csv: () => [["Service", "Qty", "Bills", "Income", "Cost", "Profit", "Margin %"], ...rows.map((row) => [row.name, +row.qty.toFixed(3), row.bills.size, row.income.toFixed(2), row.cost.toFixed(2), (row.income - row.cost).toFixed(2), marginOf(row.income - row.cost, row.income).toFixed(1)])],
          } : sview === "daily" ? {
            heads: ["Date", "Bills", "Income", "Cost", "Profit", "Received", "Due"],
            body: visible.map((row) => `<tr><td class="lx-main"><b>${esc(row.date)}</b></td><td class="num" ${lxLabel("Bills")}>${row.bills}</td><td class="num" ${lxLabel("Income")}>${tk(row.income)}</td><td class="num" ${lxLabel("Cost")}>${tk(row.cost)}</td><td class="num" ${lxLabel("Profit")}>${signed(row.income - row.cost)}</td><td class="num" ${lxLabel("Received")}>${tk(row.paid)}</td><td class="num" ${lxLabel("Due")}>${money(row.due, true)}</td></tr>`).join(""),
            foot: "",
            csv: () => [["Date", "Bills", "Income", "Cost", "Profit", "Received", "Due"], ...rows.map((row) => [row.date, row.bills, row.income.toFixed(2), row.cost.toFixed(2), (row.income - row.cost).toFixed(2), row.paid.toFixed(2), row.due.toFixed(2)])],
          } : {
            heads: ["Customer", "Bills", "Income", "Paid", "Due"],
            body: visible.map((row) => `<tr><td class="lx-main">${lxWho(row.name, row.phone)}</td><td class="num" ${lxLabel("Bills")}>${row.bills}</td><td class="num" ${lxLabel("Income")}>${tk(row.income)}</td><td class="num" ${lxLabel("Paid")}>${tk(row.paid)}</td><td class="num" ${lxLabel("Due")}>${money(row.due, true)}</td></tr>`).join(""),
            foot: "",
            csv: () => [["Customer", "Phone", "Bills", "Income", "Paid", "Due"], ...rows.map((row) => [row.name, row.phone, row.bills, row.income.toFixed(2), row.paid.toFixed(2), row.due.toFixed(2)])],
          };
          const top = services.slice(0, 5);
          const topMax = Math.max(1, ...top.map((row) => Math.abs(row.income)));

          $("#app").innerHTML = `
            <div class="lx pl">
              ${head()}
              <div class="lx-kpis pl-kpis">
                ${lxKpi("tool", "Total Income", tk(income), `${bills.length} bills`, "var(--bl)")}
                ${lxKpi("box", "Service Cost", tk(costs), "Material and labour", "var(--mut)")}
                ${lxKpi("wallet", "Received", tk(received), "Money in hand", "var(--gr)")}
                ${lxKpi("clock", "Due Amount", tk(owed), `${bills.filter((entry: any) => +entry.due > 0).length} bills`, "var(--rd)")}
                <div class="lx-kpi pl-net ${profit < 0 ? "loss" : ""}"><em>${lxIcon(profit < 0 ? "down" : "trend")}</em><div><span>${profit < 0 ? "Loss" : "Profit"}</span><b>${tk(Math.abs(profit))}</b><small>${marginOf(profit, income).toFixed(1)}% margin</small></div></div>
              </div>

              <div class="pl-grid">
                <section class="card pl-statement">
                  <div class="hd"><h2>Summary</h2></div>
                  <div class="pl-line"><span>Billed</span><b>${tk(billed)}</b></div>
                  <div class="pl-line minus"><span>Discount</span><b>− ${tk(discount)}</b></div>
                  <div class="pl-line pl-sub"><span>Total Income</span><b>${tk(income)}</b></div>
                  <div class="pl-line minus"><span>Service Cost</span><b>− ${tk(costs)}</b></div>
                  <div class="pl-line total ${profit < 0 ? "loss" : ""}"><span>${profit < 0 ? "Loss" : "Profit"}</span><b>${tk(profit)}</b></div>
                  <div class="pl-line"><span>Received</span><b class="pl-pos">${tk(received)}</b></div>
                  <div class="pl-line"><span>Due Amount</span><b class="${owed > 0 ? "pl-neg" : ""}">${tk(owed)}</b></div>
                  ${uncosted ? `<p class="pl-note">Services with no cost set count as full profit. Set costs in the Price List.</p>` : ""}
                </section>
                <section class="card pl-top">
                  <div class="hd"><h2>Top Services</h2></div>
                  ${top.length ? top.map((row, index) => `<div class="pl-bar"><div><span class="pl-rank">${index + 1}</span><b data-no-translate>${esc(row.name)}</b><em>${tk(row.income)}</em></div><i><u style="width:${Math.max(3, (Math.abs(row.income) / topMax) * 100)}%"></u></i><small>${said("Qty")}: ${+row.qty.toFixed(3)} · ${said("Profit")}: ${tk(row.income - row.cost)}</small></div>`).join("") : `<p class="pl-empty">No bill in this period</p>`}
                </section>
              </div>

              <section class="card">
                <div class="lx-bar">
                  <div class="lx-seg">
                    <button type="button" class="${sview === "bill" ? "on" : ""}" data-sview="bill">Bill Wise</button>
                    <button type="button" class="${sview === "service" ? "on" : ""}" data-sview="service">Service Wise</button>
                    <button type="button" class="${sview === "daily" ? "on" : ""}" data-sview="daily">Day Wise</button>
                    <button type="button" class="${sview === "customer" ? "on" : ""}" data-sview="customer">Customer Wise</button>
                  </div>
                  <span class="sp"></span>
                  <input class="srch lx-noprint" id="profitSearch" value="${esc(query)}" placeholder="Search">
                </div>
                <div class="wrap"><table class="lx-table pl-table">
                  <thead><tr>${table.heads.map((name, index) => `<th class="${index && !["Date", "Customer", "Service", "Status"].includes(name) ? "num" : ""}">${name}</th>`).join("")}</tr></thead>
                  <tbody>${table.body || lxEmpty(table.heads.length, "No bill in this period")}</tbody>
                  ${table.foot && rows.length ? `<tfoot><tr>${table.foot}</tr></tfoot>` : ""}
                </table></div>
                <div class="pl-pager lx-noprint">
                  <label>Show <select id="profitPageSize">${[10, 25, 50, 100].map((size) => `<option ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}</select></label>
                  <span>Showing ${rows.length ? (page - 1) * pageSize + 1 : 0} to ${Math.min(page * pageSize, rows.length)} of ${rows.length} entries</span>
                  <div><button type="button" id="profitPrev" ${page <= 1 ? "disabled" : ""}>Previous</button><b>${page} / ${pages}</b><button type="button" id="profitNext" ${page >= pages ? "disabled" : ""}>Next</button></div>
                </div>
              </section>
            </div>`;

          bindHead(table.csv, `service-${sview}`);
          document.querySelectorAll(".lx-seg [data-sview]").forEach((button) => button.addEventListener("click", () => {
            sview = (button as HTMLElement).dataset.sview as typeof sview;
            query = "";
            page = 1;
            draw();
          }));
          bindTable();
        };

        // The heading, the period and the switch between the shop's sales and its services.
        const head = () => `
              <section class="card pl-head">
                <div class="hd">
                  <div><h2>Profit &amp; Loss</h2><small class="pl-range" data-no-translate>${esc(from || to ? `${from || "…"} — ${to || "…"}` : said("All Time"))}</small></div>
                  <div class="lx-acts lx-noprint">
                    <button class="lx-out" type="button" id="profitCsv">${lxIcon("download")}<span>Excel (CSV)</span></button>
                    <button class="lx-out" type="button" id="profitPrint">${lxIcon("print")}<span>Print / PDF</span></button>
                  </div>
                </div>
                ${D.services.length || D.serviceItems.length ? `<div class="lx-seg pl-scope lx-noprint"><button type="button" class="${scope === "shop" ? "on" : ""}" data-scope="shop">${lxIcon("cart")}<span>Shop Sales</span></button><button type="button" class="${scope === "service" ? "on" : ""}" data-scope="service">${lxIcon("tool")}<span>${esc(serviceLabel())}</span></button></div>` : ""}
                <div class="pl-periods lx-noprint">
                  ${PERIODS.map(([key, label]) => `<button type="button" class="${period === key ? "on" : ""}" data-period="${key}">${label}</button>`).join("")}
                  <span class="pl-custom"><input id="profitFrom" type="date" value="${from}" aria-label="From"><span>to</span><input id="profitTo" type="date" value="${to}" aria-label="To"></span>
                </div>
              </section>`;
        const bindHead = (csvRows: () => any[][], name: string) => {
          document.querySelectorAll(".pl-periods [data-period]").forEach((button) => button.addEventListener("click", () => {
            period = (button as HTMLElement).dataset.period!;
            [from, to] = PERIODS.find(([key]) => key === period)![2]();
            page = 1;
            draw();
          }));
          document.querySelectorAll(".pl-scope [data-scope]").forEach((button) => button.addEventListener("click", () => {
            scope = (button as HTMLElement).dataset.scope as typeof scope;
            query = "";
            page = 1;
            draw();
          }));
          $("#profitFrom").onchange = (event: any) => { from = event.target.value; period = ""; page = 1; draw(); };
          $("#profitTo").onchange = (event: any) => { to = event.target.value; period = ""; page = 1; draw(); };
          $("#profitPrint").onclick = () => window.print();
          $("#profitCsv").onclick = () => {
            const csv = "﻿" + csvRows().map((row: any[]) => row.map((value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            link.download = `profit-loss-${name}-${from || "start"}-to-${to || today()}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
          };
        };
        // Search, rows per page and paging, the same on both sides.
        const bindTable = () => {
          $("#profitSearch").oninput = (event: any) => {
            query = event.target.value;
            page = 1;
            draw();
            const box = $("#profitSearch") as HTMLInputElement;
            box.focus();
            box.setSelectionRange(query.length, query.length);
          };
          $("#profitPageSize").onchange = (event: any) => { pageSize = +event.target.value; page = 1; draw(); };
          $("#profitPrev").onclick = () => { page--; draw(); };
          $("#profitNext").onclick = () => { page++; draw(); };
        };


        const draw = () => {
          if (scope === "service") { drawServices(); return; }
          const sales = D.sales.filter((sale: any) => inRange(sale.date))
            .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || String(b.inv).localeCompare(String(a.inv)));
          const kept = sales.filter((sale: any) => !sale.ret);
          const returned = sales.filter((sale: any) => sale.ret);
          const expenses = D.expenses.filter((expense: any) => inRange(expense.date));
          const revenue = sum(kept, (sale) => sale.total);
          const gross = sum(kept, (sale) => sale.p);
          const cost = revenue - gross;
          const spent = sum(expenses, (expense) => expense.amount);
          const services = D.services.filter((entry: any) => inRange(entry.date));
          const serviceIncome = sum(services, (entry) => (+entry.total || 0) - serviceCost(entry));
          const net = gross + serviceIncome - spent;

          // Every item sold in the period, gathered by product.
          const byProduct = new Map<string, AnyData>();
          for (const sale of kept) for (const item of sale.items || []) {
            const product = prod(item.id);
            const qty = +item.qty || 0;
            const price = +(item.price ?? product?.sell ?? 0);
            const row = byProduct.get(String(item.id)) || { name: product?.name || String(item.name || "Product").replace(/ \([^)]*\)$/, ""), code: product?.code || "", qty: 0, sales: 0, profit: 0, invoices: new Set() };
            row.qty += qty;
            row.sales += price * qty;
            row.profit += (price - (+product?.buy || 0)) * qty;
            row.invoices.add(sale.inv);
            byProduct.set(String(item.id), row);
          }
          const products = [...byProduct.values()].sort((a, b) => b.profit - a.profit);

          const byDay = new Map<string, AnyData>();
          const dayRow = (date: string) => byDay.get(date) || { date, invoices: 0, sales: 0, profit: 0, services: 0, expenses: 0 };
          for (const entry of services) { const row = dayRow(entry.date); row.services += (+entry.total || 0) - serviceCost(entry); byDay.set(entry.date, row); }
          for (const sale of kept) { const row = dayRow(sale.date); row.invoices++; row.sales += +sale.total || 0; row.profit += +sale.p || 0; byDay.set(sale.date, row); }
          for (const expense of expenses) { const row = dayRow(expense.date); row.expenses += +expense.amount || 0; byDay.set(expense.date, row); }
          const days = [...byDay.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));

          const needle = query.trim().toLowerCase();
          const rows: AnyData[] = view === "invoice"
            ? sales.filter((sale: any) => !needle || `${sale.inv} ${sale.party || ""} ${sale.phone || ""}`.toLowerCase().includes(needle))
            : view === "product"
              ? products.filter((row) => !needle || `${row.name} ${row.code}`.toLowerCase().includes(needle))
              : days.filter((row) => !needle || String(row.date).includes(needle));
          const pages = Math.max(1, Math.ceil(rows.length / pageSize));
          page = Math.min(page, pages);
          const visible = rows.slice((page - 1) * pageSize, page * pageSize);
          const status = (sale: any) => sale.ret ? lxPill("Returned", "var(--rd)") : +sale.due > 0 ? lxPill("Due", "var(--or)") : lxPill("Paid", "var(--gr)");

          const table = view === "invoice" ? {
            heads: ["Invoice", "Date", "Customer", "Sale", "Cost", "Profit", "Margin", "Status"],
            body: visible.map((sale) => sale.ret
              ? `<tr class="pl-ret"><td class="lx-main"><b data-no-translate>${esc(sale.inv)}</b></td><td ${lxLabel("Date")}>${esc(sale.date || "-")}</td><td ${lxLabel("Customer")}>${esc(sale.party || "-")}</td><td class="num" ${lxLabel("Sale")}><s>${tk(sale.total)}</s></td><td class="num lx-hide">-</td><td class="num" ${lxLabel("Profit")}><span class="lx-none">-</span></td><td class="num lx-hide">-</td><td ${lxLabel("Status")}>${status(sale)}</td></tr>`
              : `<tr><td class="lx-main"><b data-no-translate>${esc(sale.inv)}</b></td><td ${lxLabel("Date")}>${esc(sale.date || "-")}</td><td ${lxLabel("Customer")}>${esc(sale.party || "-")}</td><td class="num" ${lxLabel("Sale")}>${tk(sale.total)}</td><td class="num" ${lxLabel("Cost")}>${tk((+sale.total || 0) - (+sale.p || 0))}</td><td class="num" ${lxLabel("Profit")}>${signed(+sale.p || 0)}</td><td class="num" ${lxLabel("Margin")}>${marginPill(+sale.p || 0, +sale.total || 0)}</td><td ${lxLabel("Status")}>${status(sale)}</td></tr>`).join(""),
            foot: (() => { const counted = rows.filter((sale) => !sale.ret); const sold = sum(counted, (sale) => sale.total), made = sum(counted, (sale) => sale.p); return [sold, sold - made, made, marginOf(made, sold)]; })(),
            csv: () => [["Invoice", "Date", "Customer", "Sale", "Cost", "Profit", "Margin %", "Status"], ...rows.map((sale) => [sale.inv, sale.date, sale.party || "", (+sale.total || 0).toFixed(2), sale.ret ? "" : ((+sale.total || 0) - (+sale.p || 0)).toFixed(2), sale.ret ? "" : (+sale.p || 0).toFixed(2), sale.ret ? "" : marginOf(+sale.p || 0, +sale.total || 0).toFixed(1), sale.ret ? "Returned" : +sale.due > 0 ? "Due" : "Paid"])],
          } : view === "product" ? {
            heads: ["Product", "Qty Sold", "Invoices", "Sale", "Cost", "Profit", "Margin"],
            body: visible.map((row) => `<tr><td class="lx-main"><div class="lx-who"><div><b data-no-translate>${esc(row.name)}</b>${row.code ? `<small class="lx-tel" data-no-translate>${esc(row.code)}</small>` : ""}</div></div></td><td class="num" ${lxLabel("Qty Sold")}>${+row.qty.toFixed(3)}</td><td class="num" ${lxLabel("Invoices")}>${row.invoices.size}</td><td class="num" ${lxLabel("Sale")}>${tk(row.sales)}</td><td class="num" ${lxLabel("Cost")}>${tk(row.sales - row.profit)}</td><td class="num" ${lxLabel("Profit")}>${signed(row.profit)}</td><td class="num" ${lxLabel("Margin")}>${marginPill(row.profit, row.sales)}</td></tr>`).join(""),
            foot: null,
            csv: () => [["Product", "Code", "Qty Sold", "Invoices", "Sale", "Cost", "Profit", "Margin %"], ...rows.map((row) => [row.name, row.code, +row.qty.toFixed(3), row.invoices.size, row.sales.toFixed(2), (row.sales - row.profit).toFixed(2), row.profit.toFixed(2), marginOf(row.profit, row.sales).toFixed(1)])],
          } : {
            heads: ["Date", "Invoices", "Sale", "Gross Profit", serviceLabel(), "Expense", "Net Profit"],
            body: visible.map((row) => `<tr><td class="lx-main"><b>${esc(row.date)}</b></td><td class="num" ${lxLabel("Invoices")}>${row.invoices}</td><td class="num" ${lxLabel("Sale")}>${tk(row.sales)}</td><td class="num" ${lxLabel("Gross Profit")}>${tk(row.profit)}</td><td class="num" ${lxLabel(serviceLabel())}>${tk(row.services)}</td><td class="num" ${lxLabel("Expense")}>${row.expenses ? `<span class="lx-due">${tk(row.expenses)}</span>` : tk(0)}</td><td class="num" ${lxLabel("Net Profit")}>${signed(row.profit + row.services - row.expenses)}</td></tr>`).join(""),
            foot: null,
            csv: () => [["Date", "Invoices", "Sale", "Gross Profit", serviceLabel(), "Expense", "Net Profit"], ...rows.map((row) => [row.date, row.invoices, row.sales.toFixed(2), row.profit.toFixed(2), row.services.toFixed(2), row.expenses.toFixed(2), (row.profit + row.services - row.expenses).toFixed(2)])],
          };
          const columns = table.heads.length;
          const top = products.slice(0, 5);
          const topMax = Math.max(1, ...top.map((row) => Math.abs(row.profit)));

          $("#app").innerHTML = `
            <div class="lx pl">
              ${head()}

              <div class="lx-kpis pl-kpis">
                ${lxKpi("cart", "Total Sale", tk(revenue), `${kept.length} invoices`, "var(--bl)")}
                ${lxKpi("box", "Cost of Goods", tk(cost), "What the sold goods cost you", "var(--mut)")}
                ${lxKpi("trend", "Gross Profit", tk(gross), `${marginOf(gross, revenue).toFixed(1)}% margin`, "var(--gr)")}
                ${lxKpi("wallet", "Total Expense", tk(spent), `${expenses.length} expenses`, "var(--rd)")}
                <div class="lx-kpi pl-net ${net < 0 ? "loss" : ""}"><em>${lxIcon(net < 0 ? "down" : "trend")}</em><div><span>${net < 0 ? "Net Loss" : "Net Profit"}</span><b>${tk(Math.abs(net))}</b><small>${D.services.length ? "Gross profit + other income − expenses" : "Gross profit minus expenses"}</small></div></div>
              </div>

              <div class="pl-grid">
                <section class="card pl-statement">
                  <div class="hd"><h2>Summary</h2></div>
                  <div class="pl-line"><span>Total Sale</span><b>${tk(revenue)}</b></div>
                  <div class="pl-line minus"><span>Cost of Goods</span><b>− ${tk(cost)}</b></div>
                  <div class="pl-line pl-sub"><span>Gross Profit</span><b>${tk(gross)}</b></div>
                  ${D.services.length ? `<div class="pl-line plus"><span>${esc(serviceLabel())}</span><b>+ ${tk(serviceIncome)}</b></div>` : ""}
                  <div class="pl-line minus"><span>Total Expense</span><b>− ${tk(spent)}</b></div>
                  <div class="pl-line total ${net < 0 ? "loss" : ""}"><span>${net < 0 ? "Net Loss" : "Net Profit"}</span><b>${tk(net)}</b></div>
                  ${returned.length ? `<p class="pl-note">${said("Returned invoices are not counted")}: <b data-no-translate>${returned.length} · ${tk(sum(returned, (sale) => sale.total))}</b></p>` : ""}
                </section>
                <section class="card pl-top">
                  <div class="hd"><h2>Most Profitable Products</h2></div>
                  ${top.length ? top.map((row, index) => `<div class="pl-bar"><div><span class="pl-rank">${index + 1}</span><b data-no-translate>${esc(row.name)}</b><em>${signed(row.profit)}</em></div><i><u style="width:${Math.max(3, (Math.abs(row.profit) / topMax) * 100)}%;${row.profit < 0 ? "background:var(--rd)" : ""}"></u></i><small>${said("Sold")}: ${+row.qty.toFixed(3)} · ${said("Sale")}: ${tk(row.sales)}</small></div>`).join("") : `<p class="pl-empty">No sales in this period</p>`}
                </section>
              </div>

              <section class="card">
                <div class="lx-bar">
                  <div class="lx-seg">
                    <button type="button" class="${view === "invoice" ? "on" : ""}" data-view="invoice">Invoice Wise</button>
                    <button type="button" class="${view === "product" ? "on" : ""}" data-view="product">Product Wise</button>
                    <button type="button" class="${view === "daily" ? "on" : ""}" data-view="daily">Day Wise</button>
                  </div>
                  <span class="sp"></span>
                  <input class="srch lx-noprint" id="profitSearch" value="${esc(query)}" placeholder="${view === "product" ? "Search by product or code" : view === "daily" ? "Search by date" : "Search by invoice or customer"}">
                </div>
                <div class="wrap"><table class="lx-table pl-table">
                  <thead><tr>${table.heads.map((head, index) => `<th class="${index && head !== "Date" && head !== "Customer" && head !== "Status" ? "num" : ""}">${head}</th>`).join("")}</tr></thead>
                  <tbody>${table.body || lxEmpty(columns, "No sales in this period")}</tbody>
                  ${table.foot && rows.length ? `<tfoot><tr><th colspan="3">Total</th><th class="num">${tk(table.foot[0])}</th><th class="num">${tk(table.foot[1])}</th><th class="num">${tk(table.foot[2])}</th><th class="num">${table.foot[3].toFixed(1)}%</th><th></th></tr></tfoot>` : ""}
                </table></div>
                <div class="pl-pager lx-noprint">
                  <label>Show <select id="profitPageSize">${[10, 25, 50, 100].map((size) => `<option ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}</select></label>
                  <span>Showing ${rows.length ? (page - 1) * pageSize + 1 : 0} to ${Math.min(page * pageSize, rows.length)} of ${rows.length} entries</span>
                  <div><button type="button" id="profitPrev" ${page <= 1 ? "disabled" : ""}>Previous</button><b>${page} / ${pages}</b><button type="button" id="profitNext" ${page >= pages ? "disabled" : ""}>Next</button></div>
                </div>
              </section>
            </div>`;

          bindHead(table.csv, view);
          document.querySelectorAll(".lx-seg [data-view]").forEach((button) => button.addEventListener("click", () => {
            view = (button as HTMLElement).dataset.view as typeof view;
            query = "";
            page = 1;
            draw();
          }));
          bindTable();
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
        "Service Sale",
        "🧰",
        [
          ["New Bill", "services"],
          ["Bill List", "service-list"],
          ["Price List", "service-items"],
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
          ["Drive Backup", "admin-drive"],
        ],
      ],

      [
        "Help",
        "❓",
        "help",
      ],
    ];

    // The line drawing beside each sidebar entry, looked up by the name of the entry.
    const MENU_ICONS: Record<string, string> = {
      Dashboard: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
      Sales: LX_ICONS.cart,
      "Service Sale": LX_ICONS.tool,
      Purchases: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      Products: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
      "Stock List": '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
      Employee: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      "Salary Slip": '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
      Warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M8 21v-7h8v7"/>',
      "Warehouse Transfer": '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
      Customers: LX_ICONS.people,
      Suppliers: LX_ICONS.truck,
      Expenses: LX_ICONS.wallet,
      "Due List": LX_ICONS.clock,
      Subscription: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
      "Profit & Loss List": '<path d="M4 20V4M4 20h16"/><path d="M8 15l3-4 3 2 4-6"/>',
      Profile: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18a6 6 0 0 1 11 0"/>',
      Settings: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
      Admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
      Help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    };
    const menuIcon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${MENU_ICONS[name] || MENU_ICONS.Help}</svg>`;

    const hdr = () => {
      const un = $("#un");
      const ua = $("#ua");
      const visibleName = sessionUser.display_name || D.user.name;
      const brand = $("#shopBrand");

      if (brand) {
        brand.innerHTML = `${D.user.logo ? `<img src="${esc(D.user.logo)}" alt="">` : ""}<span>${esc(D.user.shop || "My Shop")}</span><small class="brand-by"><img src="/logo-mark.png" alt="">HishabPOS</small>`;
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
      document.body.classList.toggle("staff-mode", !isWorkspaceOwner);
      document.body.classList.toggle("price-locked", priceLocked());
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
            // The guide is for everyone.
            if (item[0] === "Help") return item;
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

                  <span class="mi">
                    ${menuIcon(m[0])}<span>${menuLabel(m[0])}</span>
                  </span>

                  <span class="chev">›</span>

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
                <span class="mi">
                  ${menuIcon(m[0])}<span>${menuLabel(m[0])}</span>
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

    // Keys that work on the Sale screen wherever the cursor is, and F2 from any
    // screen, so a sale can be started and finished without the mouse.
    const onShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || document.querySelector("dialog[open]")) return;
      const scanBox = document.getElementById("serialScan") as HTMLInputElement | null;
      // The service sale screen: F1 the mobile number, F4 the amount received, F9 save.
      const serviceBox = { F1: "svPhone", F4: "svPaid", F9: "svSave" }[event.key as "F1" | "F4" | "F9"];
      if (serviceBox && document.getElementById("svSave")) {
        event.preventDefault();
        const target = document.getElementById(serviceBox) as HTMLInputElement;
        if (event.key === "F9") target.click();
        else { target.focus(); target.select(); }
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        if (scanBox) { scanBox.focus(); scanBox.select(); } else location.hash = "sale-new";
      } else if (event.key === "F1" && scanBox) {
        // The buyer's phone number. The box only shows for a walk-in, so a saved customer is let go of first.
        const phone = document.getElementById("walkPhone") as HTMLInputElement | null;
        const party = document.getElementById("pp") as HTMLSelectElement | null;
        if (!phone) return;
        event.preventDefault();
        if (party?.value) {
          party.value = "";
          party.dispatchEvent(new Event("change", { bubbles: true }));
        }
        phone.focus();
        phone.select();
      } else if (event.key === "Enter" && scanBox && (event.target as HTMLElement).id === "walkPhone") {
        // With the number typed, on to the products.
        event.preventDefault();
        scanBox.focus();
      } else if (event.key === "F4" && scanBox) {
        const receive = document.getElementById("rc") as HTMLInputElement | null;
        if (!receive) return;
        event.preventDefault();
        receive.focus();
        receive.select();
      } else if (event.key === "F9" && scanBox) {
        event.preventDefault();
        savePos();
      }
    };
    document.addEventListener("keydown", onShortcut);

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
    (window as any).setCartAmount = setCartAmount;
    (window as any).setPriceLevel = setPriceLevel;
    (window as any).removeCartItem = removeCartItem;
    (window as any).hideStartCard = () => { D.settings.guideHidden = true; save(); render(); };

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
      document.removeEventListener("keydown", onShortcut);

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

import { useEffect, useRef } from "react";

const ORIGINAL_APP = String.raw`
<style>
:root{
  box-sizing:border-box;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  --bg:#f4f4f6;
  --pn:#fff;
  --tx:#141420;
  --mut:#6b7280;
  --ln:#e5e7eb;
  --in:#fff;
  --pu:#8a0a9e;
  --rd:#c8202b;
  --or:#ff9800;
  --bl:#1e88ff;
  --gr:#16a34a
}

:root[data-theme="dark"]{
  --bg:#0d0f16;
  --pn:#171a24;
  --tx:#eef0f6;
  --mut:#9aa3b5;
  --ln:#2a2f3f;
  --in:#0d0f16
}

@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]):not([data-theme="dark"]){
    --bg:#0d0f16;
    --pn:#171a24;
    --tx:#eef0f6;
    --mut:#9aa3b5;
    --ln:#2a2f3f;
    --in:#0d0f16
  }
}

html{
  scroll-padding-top:env(safe-area-inset-top,0px)
}

*{
  box-sizing:border-box
}

body{
  margin:0;
  background:var(--bg);
  color:var(--tx);
  font:14px/1.4 Inter,"Segoe UI",system-ui,Arial,sans-serif
}

.side{
  display:none;
  width:236px;
  background:#111;
  color:#fff;
  flex-direction:column;
  overflow-y:auto;
  position:fixed;
  top:0;
  bottom:0;
  left:0;
  z-index:5
}

body.nav .side{
  display:flex
}

body.nav .main{
  margin-left:236px
}

.brand{
  padding:16px 18px;
  font:900 20px/1 Inter,sans-serif;
  font-style:italic;
  border-bottom:1px solid #2a2a2a
}

.brand b{
  color:#ff3b47
}

.brand small{
  display:block;
  font:600 9px sans-serif;
  letter-spacing:4px;
  color:#aaa;
  font-style:normal;
  margin:3px 0
}

.side a,
.gh{
  display:flex;
  justify-content:space-between;
  padding:10px 14px;
  margin:2px 8px;
  border-radius:8px;
  color:#fff;
  text-decoration:none;
  font-size:13px;
  font-weight:600;
  cursor:pointer
}

.side a:hover,
.gh:hover{
  background:#222
}

.side a.on,
.gh.on{
  background:var(--pu)
}

.sub{
  display:none
}

.grp.open .sub{
  display:block
}

.sub a{
  padding:7px 14px 7px 34px;
  font-weight:500
}

.sub a.on{
  background:var(--pu)
}

.main{
  min-height:100vh
}

.hdr{
  display:flex;
  align-items:center;
  gap:10px;
  background:var(--pn);
  padding:10px 18px;
  border-bottom:1px solid var(--ln);
  position:sticky;
  top:env(safe-area-inset-top,0px);
  z-index:4
}

.hdr .sp{
  flex:1
}

.ib{
  background:none;
  border:1px solid var(--ln);
  color:var(--tx);
  border-radius:8px;
  padding:7px 11px;
  cursor:pointer;
  font:inherit
}

.av{
  width:38px;
  height:38px;
  border-radius:50%;
  background:var(--pu);
  color:#fff;
  display:grid;
  place-items:center;
  font-weight:700
}

#app{
  padding:16px 18px
}

.card{
  background:var(--pn);
  border-radius:14px;
  padding:16px;
  margin-bottom:16px;
  border:1px solid var(--ln);
  min-width:0
}

.hd{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:12px
}

h2{
  margin:0;
  font-size:19px
}

h3{
  margin:0 0 10px;
  font-size:16px
}

.btn{
  border:0;
  border-radius:8px;
  padding:9px 16px;
  color:#fff;
  font:600 13px inherit;
  cursor:pointer
}

.pu{
  background:var(--pu)
}

.rd{
  background:var(--rd)
}

.or{
  background:var(--or)
}

.bl{
  background:var(--bl)
}

.gn{
  background:var(--gr)
}

.mini{
  background:none;
  border:1px solid var(--ln);
  color:var(--tx);
  border-radius:6px;
  padding:3px 9px;
  cursor:pointer;
  font-size:12px;
  margin-right:4px
}

.srch,
input,
select{
  background:var(--in);
  color:var(--tx);
  border:1px solid var(--ln);
  border-radius:8px;
  padding:9px 11px;
  font:inherit;
  width:100%
}

.srch{
  max-width:320px;
  margin-bottom:10px
}

.wrap{
  overflow-x:auto
}

table{
  width:100%;
  border-collapse:collapse;
  min-width:520px
}

th{
  background:var(--bg);
  text-align:left;
  padding:10px 8px;
  font-size:13px
}

td{
  padding:9px 8px;
  border-top:1px solid var(--ln)
}

td.mut{
  text-align:center;
  color:var(--mut);
  padding:30px
}

.bd{
  padding:2px 9px;
  border-radius:5px;
  color:#fff;
  font-size:12px
}

.ok{
  background:var(--gr)
}

.dn{
  background:var(--rd)
}

.stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  border:1px solid var(--ln);
  border-radius:12px;
  overflow:hidden
}

.stats div{
  padding:18px;
  border:1px solid var(--ln);
  margin:-.5px;
  position:relative
}

.stats span{
  color:var(--mut)
}

.stats b{
  display:block;
  font-size:19px;
  margin:2px 0 10px
}

.stats i{
  font-style:normal;
  color:#22c55e;
  font-size:13px
}

.stats em{
  position:absolute;
  right:14px;
  top:14px;
  width:30px;
  height:30px;
  border-radius:8px;
  display:grid;
  place-items:center;
  font-style:normal
}

.two{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin-bottom:10px
}

.g2{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:16px
}

.pos{
  display:grid;
  grid-template-columns:1.5fr 1fr;
  gap:16px
}

.pg{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
  gap:10px;
  margin-top:10px
}

.pg button{
  background:var(--in);
  color:var(--tx);
  border:1px solid var(--ln);
  border-radius:10px;
  padding:12px 8px;
  cursor:pointer;
  text-align:left;
  font:inherit
}

.pg button:hover{
  border-color:var(--pu)
}

.pg small{
  color:var(--mut);
  display:block
}

.sum{
  background:var(--bg);
  border-radius:10px;
  padding:14px
}

.sum div{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  margin-bottom:8px
}

.sum input,
.sum select{
  width:110px
}

.pie{
  width:150px;
  height:150px;
  border-radius:50%
}

.lg{
  display:flex;
  gap:18px;
  align-items:center;
  flex-wrap:wrap
}

.cb{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:12px;
  margin-bottom:14px
}

.cb div{
  border-radius:10px;
  padding:14px;
  font-weight:600
}

.cb b{
  display:block;
  font-size:18px
}

.tabs button{
  background:none;
  border:0;
  border-bottom:2px solid transparent;
  padding:10px 14px;
  font:700 14px inherit;
  color:var(--tx);
  cursor:pointer
}

.tabs button.on{
  color:var(--pu);
  border-color:var(--pu)
}

dialog{
  background:var(--pn);
  color:var(--tx);
  border:1px solid var(--ln);
  border-radius:14px;
  width:min(420px,92vw)
}

dialog::backdrop{
  background:#0008
}

dialog label{
  display:block;
  margin:10px 0 4px;
  color:var(--mut);
  font-size:12px
}

.toast{
  position:fixed;
  bottom:22px;
  left:50%;
  transform:translateX(-50%);
  background:#111;
  color:#fff;
  padding:10px 18px;
  border-radius:8px;
  display:none;
  z-index:99
}

:focus-visible{
  outline:2px solid var(--or);
  outline-offset:2px
}

@media(max-width:900px){
  body.nav .main{
    margin-left:0
  }

  .g2,
  .pos{
    grid-template-columns:1fr
  }

  .stats{
    grid-template-columns:1fr 1fr
  }

  .cb{
    grid-template-columns:1fr 1fr
  }
}
</style>

<aside class="side">
  <div class="brand">
    PRAN
    <small>STICKER</small>
    <b>ZONE</b>
  </div>
  <div id="menu"></div>
</aside>

<div class="main">
  <div class="hdr">
    <button class="ib" id="menuBtn" aria-label="Menu">☰</button>
    <span class="sp"></span>
    <button class="ib" id="themeBtn">Theme</button>
    <span class="ib">🔔 0</span>

    <div>
      <small style="color:var(--mut)">Hello 👋</small>
      <br>
      <b id="un"></b>
    </div>

    <div class="av" id="ua"></div>
  </div>

  <div id="app"></div>
</div>

<dialog id="dlg"></dialog>
<div class="toast" id="toast"></div>
`;

type AnyData = Record<string, any>;

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.innerHTML = ORIGINAL_APP;

    const $ = (q: string): any => document.querySelector(q);

    const K = "pran_pos_v1";

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

    const tk = (n: any) => (+n || 0).toFixed(2) + "৳";

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
          "Bike Sticker",
          "Tank Pad",
          "Rim Tape",
        ),

        brands: m(
          "Honda",
          "Yamaha",
          "Pran",
        ),

        units: m(
          "Pcs",
          "Set",
        ),

        products: [
          {
            id: 20,
            name: "Bike Sticker (Honda)",
            code: "BS-001",
            brand: 4,
            category: 1,
            unit: 7,
            buy: 120,
            sell: 185,
            stock: 40,
          },
          {
            id: 21,
            name: "Graphic Sticker Set",
            code: "GS-002",
            brand: 6,
            category: 1,
            unit: 8,
            buy: 130,
            sell: 198,
            stock: 8,
          },
          {
            id: 22,
            name: "Tank Pad",
            code: "TP-003",
            brand: 6,
            category: 2,
            unit: 7,
            buy: 90,
            sell: 145,
            stock: 10,
          },
          {
            id: 23,
            name: "Rim Tape",
            code: "RT-004",
            brand: 6,
            category: 3,
            unit: 8,
            buy: 80,
            sell: 150,
            stock: 25,
          },
        ],

        customers: [
          {
            id: 30,
            name: "Walk-in Customer",
            phone: "",
            address: "",
          },
        ],

        suppliers: [
          {
            id: 31,
            name: "Dhaka Sticker Supplier",
            phone: "",
            address: "",
          },
        ],

        warehouses: [
          {
            id: 32,
            name: "Main Warehouse",
            location: "Dhaka",
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

        user: {
          name: "Admin",
          email: "pranstickerzone@gmail.com",
          shop: "PRAN Sticker Zone",
          open: 500000,
          printer: {
  paperSize: "58mm",
  printerName: "",
},
        },
      };
    }

    let D: AnyData;

    try {
      D = JSON.parse(localStorage.getItem(K) || "null");
    } catch {

    }D = seed();

    if (!D) {
      D = seed();
    }

    const save = () => {
      try {
        localStorage.setItem(K, JSON.stringify(D));
      } catch {}
    };

    const uid = () => D.seq++;

    const nm = (k: string, id: any) =>
      (D[k]?.find((x: any) => x.id == id) || {}).name || "-";

    const prod = (id: any) =>
      D.products.find((p: any) => p.id == id);

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

      $("#app").innerHTML = tab(
        t + " List",
        cols
          .map((c: any[]) => c[1])
          .concat("Action"),
        D[k].map((r: any) =>
          cols
            .map((c: any[]) => cell(r[c[0]], c[2]))
            .concat(
              `<button class="mini" onclick="del('${k}',${r.id})">Delete</button>`,
            ),
        ),
        `<button class="btn pu" onclick="form('${k}')">
          ＋ Add new ${t}
        </button>`,
      );
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
            onclick="document.querySelector('#dlg').close()"
          >
            Cancel
          </button>

          <button
            class="btn pu"
            onclick="add('${k}')"
          >
            Save
          </button>
        </div>
      `;

      $("#dlg").showModal();
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

        if (!v) {
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

      toast(C[k][0] + " saved");
    };

    const del = (k: string, id: number) => {
      if (confirm("Delete this record?")) {
        D[k] = D[k].filter((x: any) => x.id !== id);

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

    let CART: any[] = [];

    let PT = "sale";

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
                  D[s ? "customers" : "suppliers"],
                )}
              </select>

              <select id="pw">
                ${opts(D.warehouses)}
              </select>
            </div>

            <div class="wrap">
              <table style="min-width:440px">
                <thead>
                  <tr>
                    <th>Item</th>
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
                    value="0"
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

            <input
              class="srch"
              style="max-width:none"
              placeholder="Search product..."
              oninput="pgrid(this.value)"
            >

            <div
              class="pg"
              id="pg"
            ></div>

          </div>

        </div>
      `;

      pgrid("");

      draw();
    };

    const pgrid = (q: string) => {
      const s = PT === "sale";

      const a = D.products.filter(
        (p: any) =>
          (p.name + p.code)
            .toLowerCase()
            .includes(q.toLowerCase()),
      );

      $("#pg").innerHTML =
        a
          .map(
            (p: any) => `
              <button onclick="addc(${p.id})">

                <b>${esc(p.name)}</b>

                <small>
                  ${esc(p.code)} · Stock ${p.stock}
                </small>

                ${tk(s ? p.sell : p.buy)}

              </button>
            `,
          )
          .join("") ||
        "<div class='mut'>No product found</div>";
    };

    const addc = (id: number) => {
      const p = prod(id);

      if (!p) return;

      const c = CART.find((x) => x.id === id);

      if (c) {
        c.qty++;
      } else {
        CART.push({
          id,
          qty: 1,
          price: PT === "sale" ? p.sell : p.buy,
        });
      }

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

              <td>
                <input
                  type="number"
                  style="width:80px"
                  value="${c.price}"
                  oninput="
                    CART[${i}].price=+this.value;
                    calc()
                  "
                >
              </td>

              <td>
                <input
                  type="number"
                  min="1"
                  style="width:64px"
                  value="${c.qty}"
                  oninput="
                    CART[${i}].qty=Math.max(
                      1,
                      +this.value||1
                    );
                    calc()
                  "
                >
              </td>

              <td id="st${i}"></td>

              <td>
                <button
                  class="mini"
                  onclick="
                    CART.splice(${i},1);
                    draw()
                  "
                >
                  ✕
                </button>
              </td>

            </tr>
          `,
        ).join("") || empty(5);

      calc();
    };

    const calc = () => {
      const g = (id: string) =>
        +($("#" + id)?.value || 0);

      const s = sum(
        CART,
        (c) => c.price * c.qty,
      );

      const tot = Math.max(
        0,
        s +
          (s * g("vt")) / 100 -
          g("dc") +
          g("sh"),
      );

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

      CART.forEach((c) => {
        const pr = prod(c.id);

        if (!pr) return;

        if (s) {
          pr.stock -= c.qty;
        } else {
          pr.stock += c.qty;
          pr.buy = c.price;
        }
      });

      const pid = $("#pp").value;

      D[s ? "sales" : "purchases"].unshift({
        id: uid(),

        inv: $("#pn").value,

        date: $("#pd").value,

        party: pid
          ? nm(
              s
                ? "customers"
                : "suppliers",
              pid,
            )
          : "Walk-in Customer",

        total: T.tot,

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

      toast("Saved");
      const receiptWindow = window.open(
  "",
  "_blank",
  "width=400,height=700"
);

if (receiptWindow) {
  receiptWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Money Receipt</title>

      <style>
        @page {
          size: 58mm auto;
          margin: 0;
        }

        body {
          width: 58mm;
          margin: 0;
          padding: 4mm;
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #000;
        }

        .center {
          text-align: center;
        }

        .title {
          font-size: 18px;
          font-weight: bold;
        }

        .line {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }

        .row {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 3px 0;
          text-align: left;
        }

        th:last-child,
        td:last-child {
          text-align: right;
        }

        .total {
          font-size: 15px;
          font-weight: bold;
        }

        .thank {
          text-align: center;
          margin-top: 10px;
          font-weight: bold;
        }
      </style>
    </head>

    <body>

      <div class="center title">
        PRAN Sticker Zone
      </div>

      <div class="center">
        Money Receipt
      </div>

      <div class="line"></div>

      <div class="row">
        <span>Invoice</span>
        <span>${$("#pn").value}</span>
      </div>

      <div class="row">
        <span>Date</span>
        <span>${$("#pd").value}</span>
      </div>

      <div class="row">
        <span>Customer</span>
        <span>
          ${
            $("#pp").value
              ? nm("customers", $("#pp").value)
              : "Walk-in Customer"
          }
        </span>
      </div>

      <div class="line"></div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${CART.map((c) => {
            const pr = prod(c.id);

            return `
              <tr>
                <td>${pr?.name || "Product"}</td>
                <td>${c.qty}</td>
                <td>${(c.qty * c.price).toFixed(2)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div class="line"></div>

      <div class="row">
        <span>Discount</span>
        <span>${T.dc.toFixed(2)}</span>
      </div>

      <div class="row total">
        <span>Total</span>
        <span>${T.tot.toFixed(2)}</span>
      </div>

      <div class="row">
        <span>Paid</span>
        <span>${Math.min(T.rc, T.tot).toFixed(2)}</span>
      </div>

      <div class="row">
        <span>Due</span>
        <span>${T.due.toFixed(2)}</span>
      </div>

      <div class="row">
        <span>Payment</span>
        <span>${$("#py").value}</span>
      </div>

      <div class="line"></div>

      <div class="thank">
        Thank You!
      </div>

      <script>
        window.onload = function () {
          window.print();
        };
      </script>

    </body>
    </html>
  `);

  receiptWindow.document.close();
}

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

    const P: AnyData = {
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

        const low =
          D.products.filter(
            (p: any) =>
              p.stock <= 10,
          );

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
                      ${c[3]}
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
                    10,
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
                    onclick="ret('sales',${s.id})"
                  >
                    Return
                  </button>`,
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

      "product-add": () => {
        list("products");
        form("products");
      },

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
        const g = sum(
          D.sales,
          (s) => s.p,
        );

        const L = sum(
          D.sales.filter(
            (s: any) =>
              s.p < 0,
          ),
          (s) => -s.p,
        );

        const E = sum(
          D.expenses,
          (e) => e.amount,
        );

        const bx = [
          [
            "Loss",
            tk(L),
            "#dbeafe",
          ],
          [
            "Gross Profit",
            tk(g),
            "#d1fae5",
          ],
          [
            "Net Profit",
            tk(g - E),
            "#d1fae5",
          ],
          [
            "Total Sale",
            D.sales.length,
            "#ffedd5",
          ],
        ];

        $("#app").innerHTML =
          `<div class="cb">
            ${bx
              .map(
                (x) =>
                  `<div
                    style="
                      background:${x[2]};
                      color:#141420
                    "
                  >
                    ${x[0]}
                    <b>${x[1]}</b>
                  </div>`,
              )
              .join("")}
          </div>` +
          tab(
            "Gross Loss Profit List",
            [
              "Invoice",
              "Name",
              "Total",
              "Gross Loss/Profit",
              "Date",
              "Status",
            ],
            D.sales.map(
              (s: any) => [
                s.inv,
                esc(s.party),
                tk(s.total),
                tk(s.p),
                s.date,
                `<span
                  class="bd ${
                    s.p < 0
                      ? "dn"
                      : "ok"
                  }"
                >
                  ${
                    s.p < 0
                      ? "Loss"
                      : "Profit"
                  }
                </span>`,
              ],
            ),
          );
      },

      profile: () => {
        const u = D.user;

        const rem =
          u.open +
          sum(
            D.sales,
            (s) => s.paid,
          ) -
          sum(
            D.purchases,
            (s) => s.paid,
          ) -
          sum(
            D.expenses,
            (e) => e.amount,
          );

        $("#app").innerHTML = `
          <div
            class="card"
            style="max-width:640px"
          >

            <h2>User Profile</h2>

            <label>Name</label>

            <input
              id="u1"
              value="${esc(u.name)}"
            >

            <label>Email</label>

            <input
              id="u2"
              value="${esc(u.email)}"
            >

            <label>
              Shop Opening Balance (৳)
            </label>

            <input
              id="u3"
              type="number"
              value="${u.open}"
            >

            <p>
              Shop Remaining Balance:
              <b>${tk(rem)}</b>
            </p>

            <button
              class="btn pu"
              id="saveProfile"
            >
              Save Changes
            </button>

          </div>
        `;

        $("#saveProfile")?.addEventListener(
          "click",
          () => {
            D.user = {
              ...D.user,
              name: $("#u1").value,
              email: $("#u2").value,
              open: +$("#u3").value,
            };

            save();

            hdr();

            render();

            toast("Saved");
          },
        );
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
        "Profit & Loss List",
        "📈",
        "profit",
      ],

      [
        "Profile",
        "⚙️",
        "profile",
      ],
    ];

    const hdr = () => {
      const un = $("#un");
      const ua = $("#ua");

      if (un) {
        un.textContent =
          D.user.name;
      }

      if (ua) {
        ua.textContent =
          (
            D.user.name[0] ||
            "A"
          ).toUpperCase();
      }
    };

    const render = () => {
      const r =
        location.hash.slice(1) ||
        "dashboard";

      const menu = $("#menu");

      if (!menu) return;

      menu.innerHTML = M.map(
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
    ).pos = pos;

    (
      window as any
    ).pgrid = pgrid;

    (
      window as any
    ).addc = addc;

    (
      window as any
    ).draw = draw;

    (
      window as any
    ).calc = calc;

    (
      window as any
    ).savePos = savePos;

    (
      window as any
    ).rtab = rtab;

    (
      window as any
    ).CART = CART;

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

    return () => {
      window.removeEventListener(
        "hashchange",
        onHash,
      );

      document.body.classList.remove(
        "nav",
      );
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        minHeight: "100vh",
      }}
    />
  );
}
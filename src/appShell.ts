// The page frame of the shop screens: its styles, the sidebar, the header and the
// empty containers that PosApp fills in.
export const ORIGINAL_APP = String.raw`
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

.brand img{
  display:block;
  max-width:100%;
  max-height:64px;
  margin:0 0 10px;
  border-radius:8px
}

.brand span{
  display:block;
  overflow-wrap:anywhere
}

.brand small{
  display:block;
  font:600 9px sans-serif;
  letter-spacing:4px;
  color:#aaa;
  font-style:normal;
  margin:3px 0
}

.menu-setting-icon{width:14px;height:14px;margin-right:5px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

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

.user-menu-wrap{position:relative}
.av{padding:0;border:0;overflow:hidden;cursor:pointer;font:700 15px inherit}
.av img{width:100%;height:100%;object-fit:cover}
.user-menu{display:none;position:absolute;top:46px;right:0;z-index:30;width:168px;padding:5px;background:var(--pn);border:1px solid var(--ln);border-radius:8px;box-shadow:0 10px 24px #0002}
.user-menu.open{display:block}
.bell-wrap{position:relative}
.ib.has-alerts b{display:inline-block;min-width:18px;padding:0 5px;border-radius:9px;background:var(--rd);color:#fff;font-size:12px;line-height:18px;text-align:center}
.bell-panel{display:none;position:absolute;top:46px;right:0;z-index:30;width:min(330px,calc(100vw - 24px));max-height:65vh;overflow:auto;padding:6px;background:var(--pn);border:1px solid var(--ln);border-radius:8px;box-shadow:0 10px 24px #0002;text-align:left}
.bell-panel.open{display:block}
.bell-panel h4{margin:8px 8px 4px;color:var(--mut);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.bell-panel a{display:block;padding:8px;border-radius:5px;color:var(--tx);text-decoration:none;font-size:13px}
.bell-panel a:hover{background:var(--bg)}
.bell-panel a small{display:block;color:var(--mut)}
.bell-panel p{margin:0;padding:14px 8px;color:var(--mut);font-size:13px;text-align:center}
.user-menu a,.user-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:10px;border:0;border-radius:5px;background:transparent;color:var(--tx);text-align:left;text-decoration:none;font:inherit;cursor:pointer}
.user-menu a:hover,.user-menu button:hover{background:var(--bg)}
.user-menu svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

.profile-layout{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(0,1.6fr);gap:20px;align-items:start}
.profile-card{padding:0;overflow:hidden}
.profile-cover{height:135px;background:linear-gradient(115deg,#f3ead8 0%,#f4f2e8 35%,#e4b18b 36%,#f6ead5 60%,#7b9b54 61%,#d7e0c4 100%)}
.profile-avatar{width:86px;height:86px;margin:-43px auto 16px;position:relative;display:grid;place-items:center;overflow:hidden;border:3px solid var(--pn);border-radius:50%;background:var(--pu);color:#fff;font-size:25px;font-weight:700}
.profile-avatar img{width:100%;height:100%;object-fit:cover}
.profile-summary{margin:0 16px 18px;border:1px solid var(--ln);border-radius:7px;overflow:hidden}
.profile-summary div{padding:10px 13px;border-bottom:1px solid var(--ln)}
.profile-summary div:last-child{border-bottom:0}
.profile-form-card{padding:20px}
.profile-form-card h2{margin-bottom:18px}
.profile-form{display:grid;grid-template-columns:185px minmax(0,1fr);gap:13px 16px;align-items:center}
.profile-form label{color:var(--tx)}
.profile-form input{min-width:0}
.profile-form .profile-save{grid-column:2;justify-self:start;margin-top:18px}
.profile-form .photo-control{display:flex;align-items:center;gap:10px}
.settings-card{max-width:900px}
.settings-card h2{margin-bottom:8px}
.settings-help{margin:0 0 18px;color:var(--mut)}
.settings-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px 18px;margin-bottom:18px}
.settings-form-grid>label{display:block;color:var(--tx);font-size:13px}
.settings-form-grid input,.settings-form-grid select{display:block;margin-top:6px}
.settings-wide{grid-column:1/-1}
.setting-toggle{display:flex;align-items:center;justify-content:space-between;max-width:620px;padding:13px 0;border-bottom:1px solid var(--ln)}
.setting-toggle input{width:18px;height:18px;accent-color:var(--pu)}
.setting-toggle:last-of-type{margin-bottom:18px}
.role-form{width:min(760px,94vw);max-height:90vh;padding:0;overflow:auto}
.role-form-content{padding:22px}
.role-form-title{margin-bottom:5px}
.role-form-help{margin:0 0 22px;color:var(--mut);font-size:13px}
.role-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px 22px;padding:8px 0 22px}
.role-field{position:relative;display:block;padding:0 11px 4px;border:1px solid var(--ln);border-radius:7px;background:var(--in);color:var(--tx);font-size:13px}
.role-field span{position:absolute;top:-9px;left:11px;padding:0 6px;background:var(--pn);font-weight:500}
.role-field input{height:38px;padding:8px 0 0;border:0;outline:0;background:transparent}
.role-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:9px;font-weight:700}
.role-section-title small{color:var(--mut);font-size:12px;font-weight:400}
.role-permissions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 12px;padding:12px;border:1px solid var(--ln);border-radius:8px;background:var(--bg)}
.role-permissions label{display:flex;align-items:center;gap:8px;min-height:34px;color:var(--tx);font-size:13px;cursor:pointer}
.role-permissions input{width:16px;height:16px;accent-color:var(--pu)}
.role-select-all{font-size:12px;color:var(--pu);cursor:pointer}
.role-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.role-actions button{min-width:100px}
.role-form-status{display:none;margin-top:14px;padding:10px 12px;border-radius:7px;background:#fff0f0;color:#b42318;font-size:13px;line-height:1.45}
.role-form-status.visible{display:block}
@media(max-width:620px){.settings-form-grid{grid-template-columns:1fr}.settings-wide{grid-column:auto}.role-fields{grid-template-columns:1fr;gap:17px}.role-permissions{grid-template-columns:repeat(2,minmax(0,1fr))}.role-form-content{padding:18px}}
@media(max-width:760px){.profile-layout{grid-template-columns:1fr}.profile-form{grid-template-columns:1fr;gap:7px}.profile-form input{margin-bottom:9px}.profile-form .profile-save{grid-column:1;margin-top:10px}}
@media(max-width:620px){.settings-form-grid{grid-template-columns:1fr}.settings-wide{grid-column:auto}.role-permissions{grid-template-columns:1fr}}

.profit-page{padding:14px 0 16px;overflow:hidden}.profit-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px 14px;border-bottom:1px solid #a000b5}.profit-heading h2{font-size:18px}.profit-heading button{display:inline-flex;align-items:center;gap:5px}.profit-heading button svg{width:14px;height:14px;flex:0 0 14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.profit-heading>div{display:flex;gap:8px}.profit-heading .btn,.profit-heading .ib{width:auto;padding:8px 12px}.profit-heading .btn svg{stroke:#fff}.profit-heading .profit-selected svg{stroke:var(--pu)}.profit-selected{border-color:var(--pu);color:var(--pu)}.profit-stats{display:grid;grid-template-columns:repeat(4,minmax(105px,128px));gap:18px 34px;padding:20px 22px 26px}.profit-stat{min-height:92px;padding:13px 14px;border-radius:9px;box-shadow:0 3px 7px #0002;color:#27313a}.profit-stat span{display:block;font-size:18px;font-weight:600}.profit-stat b{display:block;margin:2px 0;font-size:15px;font-weight:500}.profit-stat small{display:inline-block;padding:2px 7px;border-radius:5px;background:#fff;font-size:10px;font-weight:600}.profit-filters{display:grid;grid-template-columns:minmax(150px,226px) 1fr;gap:14px;padding:0 14px 26px;align-items:end}.profit-filters>select{width:auto}.profit-filters>input{width:100%}.profit-filters>label{grid-column:2;display:grid;gap:3px;color:var(--mut);font-size:12px}.profit-date-range{display:flex;align-items:center;gap:8px}.profit-date-range input{height:34px}.profit-export{display:flex;justify-content:flex-end;gap:9px;padding:0 14px 2px}.profit-export button{width:24px;height:22px;display:grid;place-items:center;padding:2px;border:0;background:transparent;color:#16a66a;cursor:pointer}.profit-export button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.profit-export button:nth-child(2){color:#9c50fa}.profit-export button:nth-child(3){color:#ff8a27}.profit-table{min-width:700px}.profit-table thead{background:#9000a5;color:#fff}.profit-table th{background:#9000a5;color:#fff}.profit-table td{text-align:center}.profit-table td:nth-child(5){white-space:nowrap}@media(max-width:700px){.profit-heading{align-items:flex-start;flex-direction:column}.profit-stats{grid-template-columns:repeat(2,minmax(105px,1fr));gap:12px;padding:16px}.profit-filters{grid-template-columns:1fr}.profit-filters>label{grid-column:1}.profit-date-range{flex-wrap:wrap}}

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

.product-create .hd{margin-bottom:26px}
.product-create .hd h2{font-size:20px}
.product-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:25px 24px;padding-top:28px}
.product-field{position:relative;display:block;padding:0 12px 8px;border:1px solid var(--ln);border-radius:7px;background:var(--in);color:var(--tx);font-size:14px}
.product-field>span{position:absolute;top:-10px;left:12px;padding:0 7px;background:var(--pn);font-size:14px}
.product-field input,.product-field select{height:45px;padding:10px 0 0;border:0;outline:0;background:transparent;color:var(--tx);font:inherit}
.product-field input[type=file]{padding-top:11px;font-size:13px}
.product-serial-input{width:100%;min-height:88px;margin-top:13px;padding:10px;border:1px solid var(--ln);border-radius:7px;background:var(--in);color:var(--tx);font:inherit;resize:vertical}
.serial-scan{margin:10px 0}.serial-scan label{display:block;margin-bottom:5px;color:var(--mut);font-size:12px}.serial-scan input{border-color:var(--pu)}
.product-create-actions{display:flex;justify-content:center;gap:18px;margin:32px 0 8px}
.product-create-actions .btn{min-width:134px}
.product-list-link{display:inline-flex;align-items:center;gap:7px;text-decoration:none}
.product-list-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 0 14px}
.product-list-toolbar select{width:auto;min-width:108px}
.product-list-toolbar input{width:min(100%,304px)}
.product-export-actions{display:flex;gap:8px;margin-left:auto}
.product-export-actions button{width:34px;height:32px;display:grid;place-items:center;border:0;border-radius:6px;color:#fff;font-size:11px;font-weight:700;cursor:pointer}
.product-export-actions svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.product-export-actions .excel{background:#12a66a}
.product-export-actions .pdf{background:#8a0a9e}
.product-export-actions .print{background:#ff8b27}
.product-table{min-width:970px}
.product-table th,.product-table td{white-space:nowrap}
.product-thumb{width:42px;height:42px;border-radius:5px;object-fit:cover;vertical-align:middle}
.product-thumb-empty{display:inline-grid;width:42px;height:42px;place-items:center;border-radius:5px;background:var(--bg);color:var(--mut);font-size:10px;vertical-align:middle}
.product-page-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;color:var(--mut)}
.product-page-footer button{padding:6px 10px;border:1px solid var(--ln);border-radius:6px;background:var(--pn);color:var(--tx);cursor:pointer}
.product-page-footer button:disabled{opacity:.45;cursor:default}
@media print{.side,.hdr,.product-list-toolbar,.product-page-footer,.action-cell,.product-add-control{display:none!important}#app{padding:0!important}.card{border:0!important;box-shadow:none!important}}
@media(max-width:700px){.product-fields{grid-template-columns:1fr;gap:22px}.product-create-actions{gap:10px}}

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

.row-actions{position:relative;text-align:center}
.row-actions summary{list-style:none;cursor:pointer;font-size:22px;line-height:20px}
.row-actions summary::-webkit-details-marker{display:none}
.row-actions[open]>div{position:absolute;right:0;top:23px;z-index:8;min-width:145px;padding:5px;background:var(--pn);border:1px solid var(--ln);border-radius:7px;box-shadow:0 8px 20px #0002}
.row-actions button{display:block;width:100%;padding:8px;border:0;border-radius:4px;background:transparent;color:var(--tx);text-align:left;cursor:pointer}
.row-actions button:hover{background:var(--bg)}
.action-menu[popover]{position:fixed;inset:auto;margin:0;padding:5px;min-width:150px;border:1px solid var(--ln);border-radius:7px;background:var(--pn);color:var(--tx);box-shadow:0 8px 24px #0003}
.action-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:8px;border:0;border-radius:4px;background:transparent;color:var(--tx);text-align:left;cursor:pointer;font:inherit;white-space:nowrap}
.action-menu button svg{width:14px;height:14px;flex:0 0 14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.action-menu button:hover{background:var(--bg)}
.action-cell{text-align:center}
.action-trigger{width:30px;height:30px;display:inline-grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--tx);cursor:pointer}
.more-dots{display:flex;flex-direction:column;gap:3px}
.more-dots i{display:block;width:3px;height:3px;border-radius:50%;background:currentColor}
.action-trigger:hover{background:var(--bg)}

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
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:0;
  border:0;
  border-radius:12px;
  overflow:visible
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

.stats em svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

.two{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin-bottom:10px
}
.walkin-fields[hidden]{display:none}

.g2{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:16px
}

.pos{
  display:grid;
  grid-template-columns:1.2fr 1fr;
  gap:16px
}

.pg{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
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
  border-color:var(--rd);
  box-shadow:0 0 0 1px var(--rd)
}

.pg .pos-product-image,.pg .pos-product-placeholder{display:block;width:100%;height:112px;margin-bottom:9px;border-radius:7px;object-fit:cover;background:var(--bg)}
.pg .pos-product-placeholder{display:grid;place-items:center;color:var(--mut);font-size:12px}
.product-image-preview{display:none;width:80px;height:64px;margin:8px 0 0;border-radius:6px;object-fit:cover}

.pg small{
  color:var(--mut);
  display:block
}

.pos-product-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.pos-product-toolbar input{width:auto;min-width:100px;flex:1;padding:9px 11px}
.pos-product-toolbar select{width:auto;max-width:116px;padding:9px 10px;color:#fff;border:0;border-radius:7px;font-weight:600;cursor:pointer}
.product-category-filter{background:#f59e0b}
.product-brand-filter{background:#1685f8}
.product-search-button{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border:0;border-radius:7px;background:#d9272e;color:#fff;cursor:pointer}
.product-search-button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.pg .pos-product-card{padding:0;overflow:hidden;border-radius:7px}
.pg .pos-product-image,.pg .pos-product-placeholder{height:auto;aspect-ratio:1;margin:0;border-radius:0;object-fit:cover}
.pg .pos-product-info{display:grid;gap:3px;padding:9px 10px 11px}
.pg .pos-product-info b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.pg .pos-product-info small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg .pos-product-info strong{font-size:14px}
.pg .pos-product-quantity{margin-top:8px;font-size:13px;font-weight:600}
.pg .pos-product-quantity em{color:#16a34a;font-style:normal}

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

@media(max-width:520px){
  .pos-product-toolbar{flex-wrap:wrap}
  .pos-product-toolbar input{flex-basis:calc(100% - 50px)}
  .pos-product-toolbar select{max-width:none;flex:1}
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
  <div class="brand" id="shopBrand"></div>
  <div id="menu"></div>
</aside>

<div class="main">
  <div class="hdr">
    <button class="ib" id="menuBtn" aria-label="Menu">☰</button>
    <span class="sp"></span>
    <button class="ib" id="langBtn" data-no-translate></button>
    <button class="ib" id="themeBtn">Theme</button>
    <span class="bell-wrap">
      <button class="ib" id="bellBtn" type="button" aria-expanded="false" aria-label="Notifications">🔔 <b id="bellCount">0</b></button>
      <div class="bell-panel" id="bellPanel"></div>
    </span>

    <div>
      <small style="color:var(--mut)">Hello 👋</small>
      <br>
      <b id="un"></b>
    </div>

    <div class="user-menu-wrap">
      <button class="av" id="ua" aria-label="Open profile menu" aria-haspopup="true" aria-expanded="false"></button>
      <div class="user-menu" id="userMenu">
        <a href="#profile"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>My Profile</a>
        <button type="button" id="logoutBtn"><svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg>Logout</button>
      </div>
    </div>
  </div>

  <div id="app"><section class="card"><h2>Loading shop data…</h2><p>Please wait while your account and shop information loads.</p></section></div>
</div>

<dialog id="dlg"></dialog>
<div class="toast" id="toast"></div>
`;

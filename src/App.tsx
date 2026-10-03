import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteApp,
  initializeApp,
} from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { hostingApi } from "./hostingApi";
import app, { auth, db, storage } from "./firebase";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadString } from "firebase/storage";

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

type AnyData = Record<string, any>;

function POSApp() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const boot = async () => {
    const owner = auth.currentUser;
    if (!owner) return;
    let personalData: AnyData | null = null;
    try {
      const personalSnapshot = await getDoc(doc(db, "users", owner.uid, "private", "pos"));
      if (personalSnapshot.exists()) personalData = personalSnapshot.data().data as AnyData;
    } catch (error) {
      console.error("Could not load account profile", error);
    }
    if (personalData?.user?.authUid === owner.uid && !personalData.user.workspaceOwnerUid) {
      root.innerHTML = `<div class="auth-feedback error" style="margin:48px auto;max-width:600px">This staff account was created before shared shop data was enabled. Ask the owner to link or recreate this account for the shared workspace.</div>`;
      return;
    }
    const workspaceOwnerUid = personalData?.user?.workspaceOwnerUid || owner.uid;
    const isWorkspaceOwner = workspaceOwnerUid === owner.uid;
    let membership: AnyData | null = null;
    if (!isWorkspaceOwner) {
      try {
        const membershipSnapshot = await getDoc(doc(db, "users", workspaceOwnerUid, "members", owner.uid));
        if (membershipSnapshot.exists()) membership = membershipSnapshot.data() as AnyData;
      } catch (error) {
        console.error("Could not load workspace role", error);
      }
      if (!membership || membership.active === false) {
        root.innerHTML = `<div class="auth-feedback error" style="margin:48px auto;max-width:600px">This account is not linked to an active shop workspace. Ask the shop owner to create or link your account.</div>`;
        return;
      }
    }
    const K = `pran_pos_v1_${workspaceOwnerUid}`;
    const productsCollection = collection(db, "users", workspaceOwnerUid, "private", "pos", "products");
    const productDocument = (productId: any) => doc(db, "users", workspaceOwnerUid, "private", "pos", "products", String(productId));
    const uploadProductImage = async (productId: any, imageData: string) => {
      const path = `workspaces/${workspaceOwnerUid}/products/${productId}.jpg`;
      const uploaded = await uploadString(storageRef(storage, path), imageData, "data_url", { contentType: "image/jpeg" });
      return { image: await getDownloadURL(uploaded.ref), imagePath: path };
    };
    const removeProductImage = async (path: string) => {
      if (path) await deleteObject(storageRef(storage, path));
    };
    let cloudData: AnyData | null = null;
    try {
      const snapshot = await getDoc(doc(db, "users", workspaceOwnerUid, "private", "pos"));
      if (snapshot.exists()) cloudData = snapshot.data().data as AnyData;
    } catch (error) {
      console.error("Could not load cloud data", error);
    }
    let cloudProducts: AnyData[] | null = null;
    try {
      const productsSnapshot = await getDocs(productsCollection);
      cloudProducts = productsSnapshot.docs.map((entry) => ({ ...entry.data(), id: entry.data().id ?? entry.id }));
    } catch (error) {
      console.error("Could not load separate product records", error);
      root.innerHTML = `<div class="auth-feedback error" style="margin:48px auto;max-width:600px">Could not load products from the shop database. Refresh after the owner updates the Firebase rules.</div>`;
      return;
    }
    if (disposed) return;

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
          name: "Admin",
          email: "pranstickerzone@gmail.com",
          shop: "PRAN Sticker Zone",
          open: 500000,
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
      D = cloudData || JSON.parse(localStorage.getItem(K) || "null") || seed();
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

    if (cloudProducts.length) D.products = cloudProducts;

    const activeRoleId = isWorkspaceOwner
      ? D.user.roleId
      : (membership?.roleId ?? personalData?.user?.roleId ?? null);

    CURRENCY_SYMBOL = D.currencies?.find((currency: any) => currency.id == D.settings.currencyId)?.symbol || String.fromCharCode(2547);

    // If product records still live in the older shared POS document, leave
    // them there during startup. The first normal save writes them to their
    // own documents, avoiding a long blocking image upload/migration on login.
    let lastSyncedProducts = new Map<string, string>((cloudProducts.length ? D.products || [] : []).map((product: AnyData) => [String(product.id), JSON.stringify(product)]));
    let cloudSaveQueue: Promise<void> = Promise.resolve();
    const save = () => {
      try { localStorage.setItem(K, JSON.stringify(D)); } catch {}
      const productSnapshot = JSON.parse(JSON.stringify(D.products || [])) as AnyData[];
      const { products: _products, ...posData } = D;
      const posSnapshot = JSON.parse(JSON.stringify(posData));
      cloudSaveQueue = cloudSaveQueue.then(async () => {
        await setDoc(doc(db, "users", workspaceOwnerUid, "private", "pos"), {
          data: posSnapshot,
          updatedAt: new Date().toISOString(),
        });
        const nextProducts = new Map(productSnapshot.map((product) => [String(product.id), JSON.stringify(product)]));
        const writes = productSnapshot.filter((product) => lastSyncedProducts.get(String(product.id)) !== JSON.stringify(product));
        const deletes = [...lastSyncedProducts.keys()].filter((productId) => !nextProducts.has(productId));
        const operations: Array<{ type: "set"; product: AnyData } | { type: "delete"; id: string }> = [
          ...writes.map((product) => ({ type: "set" as const, product })),
          ...deletes.map((id) => ({ type: "delete" as const, id })),
        ];
        for (let start = 0; start < operations.length; start += 450) {
          const batch = writeBatch(db);
          operations.slice(start, start + 450).forEach((operation) => {
            if (operation.type === "set") batch.set(productDocument(operation.product.id), operation.product);
            else batch.delete(productDocument(operation.id));
          });
          await batch.commit();
        }
        lastSyncedProducts = nextProducts;
      }).catch((error) => {
        console.error("Could not sync data to cloud", error);
        const detail = String((error as { message?: string })?.message || "");
        toast(/maximum size|1\s*MiB|too large|larger than/i.test(detail)
          ? "Cloud save failed: a record is too large. Reduce its size and try again."
          : "Cloud save failed. Check your internet connection and Firebase access.");
      });
    };

    const dataUrlForMigration = async (source: string) => {
      if (!source || source.startsWith("/uploads/")) return source;
      if (source.startsWith("data:image/")) return source;
      const response = await fetch(source);
      if (!response.ok) throw new Error("Could not download an existing image.");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("An existing file is not an image.");
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image."));
        reader.onerror = () => reject(new Error("Could not read the image."));
        reader.readAsDataURL(blob);
      });
    };

    const moveImageToHosting = async (source: string) => {
      const image = await dataUrlForMigration(source);
      if (!image || image.startsWith("/uploads/")) return image;
      const uploaded = await hostingApi.uploadImage(image);
      return uploaded.url;
    };

    const migrateToHosting = async (password: string) => {
      const firebaseUser = auth.currentUser;
      const name = String(firebaseUser?.displayName || D.user.name || "Shop owner").trim();
      const email = String(firebaseUser?.email || D.user.email || "").trim().toLowerCase();
      if (!email) throw new Error("Your Firebase account does not have an email address.");
      try {
        await hostingApi.register(name, email, password);
      } catch (error) {
        if ((error as { status?: number }).status !== 409) throw error;
        await hostingApi.login(email, password);
      }
      const copy = JSON.parse(JSON.stringify(D)) as AnyData;
      copy.user = { ...copy.user, name, email };
      delete copy.user.authUid;
      delete copy.user.workspaceOwnerUid;
      if (copy.user.avatar) copy.user.avatar = await moveImageToHosting(copy.user.avatar);
      copy.products = await Promise.all((copy.products || []).map(async (product: AnyData) => {
        if (!product.image) return { ...product, imagePath: "" };
        const image = await moveImageToHosting(product.image);
        return { ...product, image, imagePath: "" };
      }));
      await hostingApi.saveShop(copy);
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
        const productImagePath = k === "products" ? record?.imagePath : "";
        if (record?.items && !record.ret) {
          record.items.forEach((item: any) => {
            const product = prod(item.id);
            if (!product) return;
            if (k === "sales") product.stock += +item.qty || 0;
            if (k === "purchases") product.stock -= +item.qty || 0;
          });
        }
        D[k] = D[k].filter((x: any) => x.id !== id);

        if (productImagePath) void removeProductImage(productImagePath).catch((error) => console.warn("Could not delete product image from Storage", error));

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

            ${s ? `<div class="serial-scan"><label for="serialScan">Scan or enter product serial number, then press Enter</label><input id="serialScan" autocomplete="off" placeholder="Enter serial number"></div>` : ""}

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
          ${typeof p.image === "string" && p.image.startsWith("data:image/")
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
        return product && product.stock <= (+product.lowAlert || 10);
      });
      const notice = s
        ? lowStockItem && D.settings.notifications.lowStock
          ? `Low stock: ${lowStockItem ? prod(lowStockItem.id)?.name : "product"}`
          : T.due > 0 && D.settings.notifications.dueReminders
            ? "Sale saved with a due balance"
            : D.settings.notifications.sales ? "Sale saved" : "Saved"
        : D.settings.notifications.purchases ? "Purchase saved" : "Saved";
      toast(notice);
      if (s) openInvoice(D.sales[0].id, true, true);

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
              <label class="product-field"><span>Image</span><input id="p_image" type="file" accept="image/*"><img id="productImagePreview" class="product-image-preview" alt="Product image preview"></label>
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
            toast("Firebase Storage is not active yet; the compressed image will stay with this product record.");
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
      const shopName = esc(D.user.shop || "PRAN Sticker Zone");

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
          <header class="center"><div class="brand">${shopName}</div><div class="sub">${esc(D.user.phone || "")}</div><div class="sub">${esc(D.user.address || "")}</div><div class="sub">Money Receipt</div></header>
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
        <div class="two"><div><label>Stock</label><input id="ep_stock" type="number" min="0" step="1" value="${+product.stock || 0}"></div><div><label>Serial</label><select id="ep_serial"><option value="false" ${product.hasSerial ? "" : "selected"}>No</option><option value="true" ${product.hasSerial ? "selected" : ""}>Yes</option></select></div></div>
        <label id="editSerialInventoryField">Available Serial Numbers<textarea id="ep_serials" class="product-serial-input" placeholder="Enter one serial number per line, or separate with commas">${esc((product.serials || []).join("\n"))}</textarea></label>
        <label>Replace Image (optional)</label><input id="ep_image" type="file" accept="image/*">
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
            image = uploadedImage.image;
            imagePath = uploadedImage.imagePath;
          } catch (error) {
            console.error("Could not upload replacement product image", error);
            image = await optimizeProductImage(imageFile).catch(() => product.image || "");
            imagePath = "";
            toast("Firebase Storage is not active yet; the compressed image will stay with this product record.");
          }
        }
        Object.assign(product, {
          name: $("#ep_name").value.trim(), code: $("#ep_code").value.trim(),
          brand: +$("#ep_brand").value, category: +$("#ep_category").value, unit: +$("#ep_unit").value,
          buy: Math.max(0, +$("#ep_buy").value || 0), sell: Math.max(0, +$("#ep_sell").value || 0),
          stock: Math.max(0, +$("#ep_stock").value || 0), hasSerial: $("#ep_serial").value === "true",
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
      $("#app").innerHTML = `<section class="card settings-card"><h2>General Settings</h2><p class="settings-help">Shop information and defaults used in sales and receipts.</p><form id="generalSettingsForm"><div class="settings-form-grid"><label>Shop Name<input id="settingShop" value="${esc(D.user.shop || "")}" required></label><label>Email<input id="settingEmail" type="email" value="${esc(D.user.shopEmail || "")}"></label><label>Phone<input id="settingPhone" type="tel" value="${esc(D.user.phone || "")}"></label><label>Address<input id="settingAddress" value="${esc(D.user.address || "")}"></label><label>Default Currency<select id="settingCurrency">${opts(D.currencies, D.settings.currencyId)}</select></label><label>Current User Role${!isWorkspaceOwner || D.user.authUid ? `<input value="${esc(D.roles.find((entry: any) => entry.id == (isWorkspaceOwner ? D.user.roleId : activeRoleId))?.name || "Assigned role")}" disabled>` : `<select id="settingRole">${opts(D.roles, D.user.roleId)}</select>`}</label><label>Default VAT (%)<input id="settingTax" type="number" min="0" step="0.01" value="${+D.settings.taxRate || 0}"></label><label class="settings-wide">Invoice Footer<input id="settingFooter" value="${esc(D.settings.invoiceFooter || "Thank you for your purchase!")}"></label></div><button class="btn pu" type="submit">Save Changes</button></form></section>`;
      $("#generalSettingsForm").addEventListener("submit", (event: Event) => {
        event.preventDefault();
        D.user = { ...D.user, roleId: !isWorkspaceOwner || D.user.authUid ? D.user.roleId : +$("#settingRole").value, shop: $("#settingShop").value.trim(), shopEmail: $("#settingEmail").value.trim(), phone: $("#settingPhone").value.trim(), address: $("#settingAddress").value.trim() };
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
      dialog.innerHTML = `<div class="role-form-content"><h2 class="role-form-title">${role ? "Edit User Role" : "Add User Role"}</h2><p class="role-form-help">${role ? "Update this role’s access to workspace sections." : "Create a login account and choose the sections it can access."}</p>${role ? "" : `<div class="role-fields"><label class="role-field"><span>User Title</span><input id="memberName" autocomplete="name" placeholder="e.g. Sales Executive" required></label><label class="role-field"><span>Email Address</span><input id="memberEmail" type="email" autocomplete="email" placeholder="name@example.com" required></label><label class="role-field"><span>Password</span><input id="memberPassword" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required></label><label class="role-field"><span>Confirm Password</span><input id="memberConfirm" type="password" autocomplete="new-password" minlength="6" placeholder="Re-enter password" required></label></div>`}<label class="role-field" style="margin-bottom:20px"><span>Role Name</span><input id="roleName" value="${esc(role?.name || "")}" placeholder="e.g. Sales Team" required></label><div class="role-section-title"><span>Permissions</span><label class="role-select-all"><input id="roleSelectAll" type="checkbox"> Select all</label></div><div class="role-permissions">${ROLE_PERMISSIONS.map((permission) => `<label><input type="checkbox" value="${permission}" ${permissions.includes("All permissions") || permissions.includes(permission) ? "checked" : ""}>${permission}</label>`).join("")}</div><div id="roleFormStatus" class="role-form-status" role="status" aria-live="polite"></div><div class="role-actions"><button class="btn" style="background:var(--bg);color:var(--tx);border:1px solid var(--ln)" id="cancelRole" type="button">Cancel</button><button class="btn pu" id="saveRole" type="button">${role ? "Save Changes" : "Create Account"}</button></div></div>`;
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
          if (password.length < 6) { showRoleError("Password must contain at least 6 characters."); $("#memberPassword").focus(); return; }
          if (password !== confirmPassword) { showRoleError("Passwords do not match."); $("#memberConfirm").focus(); return; }

          const roleId = uid();
          const newRole = { id: roleId, name, permissions: selected };
          const secondaryApp = initializeApp(app.options, `role-account-${Date.now()}`);
          try {
            const memberAuth = getAuth(secondaryApp);
            const memberDb = getFirestore(secondaryApp);
            const credential = await createUserWithEmailAndPassword(memberAuth, memberEmail, password);
            try {
              await updateProfile(credential.user, { displayName: memberName });
            const memberData = seed();
            memberData.roles = [...D.roles, newRole];
            memberData.products = [];
              memberData.user = { ...memberData.user, name: memberName, email: memberEmail, roleId, authUid: credential.user.uid, workspaceOwnerUid: owner.uid };
              await setDoc(doc(memberDb, "users", credential.user.uid, "private", "pos"), { data: memberData, updatedAt: new Date().toISOString() });
              await setDoc(doc(db, "users", owner.uid, "members", credential.user.uid), {
                roleId,
                active: true,
                name: memberName,
                email: memberEmail,
                createdAt: new Date().toISOString(),
              });
            } catch (error) {
              await deleteUser(credential.user);
              throw error;
            }
            D.roles.push(newRole);
            save();
          } finally {
            await deleteApp(secondaryApp);
          }
          dialog.close(); rolesPage(); toast("Login account created with this role");
        } catch (error) {
          const code = (error as { code?: string }).code;
          const accountErrors: Record<string, string> = {
            "auth/email-already-in-use": "An account already exists for this email",
            "auth/invalid-email": "Enter a valid email address",
            "auth/weak-password": "Choose a stronger password",
            "auth/operation-not-allowed": "Email and password sign-in is disabled in Firebase",
            "permission-denied": "Firebase rules prevented saving the account profile",
            "firestore/permission-denied": "Firebase rules prevented saving the account profile",
          };
          showRoleError(accountErrors[code || ""] || `Could not create the login account (${code || "unknown error"}). Check Firebase settings and try again.`);
        } finally {
          saveButton.disabled = false;
        }
      });
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
        const firebaseUser = auth.currentUser;
        const remaining = u.open + sum(D.sales, (sale: any) => sale.paid) - sum(D.purchases, (purchase: any) => purchase.paid) - sum(D.expenses, (expense: any) => expense.amount);
        const joined = firebaseUser?.metadata.creationTime
          ? new Date(firebaseUser.metadata.creationTime).toLocaleDateString()
          : "Not available";
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
                <input id="profileName" value="${esc(firebaseUser?.displayName || u.name)}" required>
                <label for="profileEmail">Email</label>
                <input id="profileEmail" type="email" value="${esc(firebaseUser?.email || u.email)}" required>
                <label for="profilePhoto">Profile Picture</label>
                <input id="profilePhoto" type="file" accept="image/*">
                <label for="profileCurrentPassword">Current Password</label>
                <input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="Enter your current password">
                <label for="profileNewPassword">New Password</label>
                <input id="profileNewPassword" type="password" autocomplete="new-password" placeholder="Enter new password" minlength="6">
                <label for="profileConfirmPassword">Confirm password</label>
                <input id="profileConfirmPassword" type="password" autocomplete="new-password" placeholder="Enter confirm password">
                <label for="profileOpeningBalance">Shop Opening Balance</label>
                <input id="profileOpeningBalance" type="number" min="0" step="0.01" value="${+u.open || 0}">
                <button class="btn pu profile-save" type="submit">Save Changes</button>
              </form>
              ${isWorkspaceOwner ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--ln)"><h3 style="margin:0 0 8px">Move data to Namecheap</h3><p class="settings-help">Create a new Namecheap password once. Your shop data and product images will then be copied to this hosting account.</p><button class="btn gn" id="migrateHosting" type="button">Move my data to Namecheap</button></div>` : ""}
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
          const email = $("#profileEmail").value.trim();
          const currentPassword = $("#profileCurrentPassword").value;
          const newPassword = $("#profileNewPassword").value;
          const confirmPassword = $("#profileConfirmPassword").value;
          if (newPassword && newPassword !== confirmPassword) {
            toast("New password and confirmation do not match");
            return;
          }
          if (newPassword && newPassword.length < 6) {
            toast("Password must be at least 6 characters");
            return;
          }
          const needsReauth = Boolean(newPassword || email !== (firebaseUser?.email || u.email));
          if (needsReauth && (!currentPassword || !firebaseUser?.email)) {
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
            if (needsReauth && firebaseUser?.email) {
              const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
              await reauthenticateWithCredential(firebaseUser, credential);
            }
            if (firebaseUser && newPassword) await updatePassword(firebaseUser, newPassword);
            if (firebaseUser && email !== (firebaseUser.email || "")) await updateEmail(firebaseUser, email);
            if (firebaseUser) await updateProfile(firebaseUser, { displayName: name });
            D.user = {
              ...D.user,
              name,
              email,
              avatar,
              open: Math.max(0, +$("#profileOpeningBalance").value || 0),
            };
            save();
            hdr();
            render();
            toast("Profile updated");
          } catch (error) {
            const code = (error as { code?: string }).code;
            const message = code === "auth/wrong-password" || code === "auth/invalid-credential"
              ? "Current password is incorrect"
              : code === "auth/email-already-in-use"
                ? "This email is already in use"
                : "Profile could not be updated. Check your details and try again.";
            toast(message);
          }
        });

        $("#migrateHosting")?.addEventListener("click", () => {
          const dialog = $("#dlg") as HTMLDialogElement;
          dialog.innerHTML = `<h3>Move data to Namecheap</h3><p>Your current shop data will be copied to Namecheap. Choose a new password for the Namecheap account. Firebase will remain unchanged for now.</p><label>New Password</label><input id="hostingPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"><label>Confirm Password</label><input id="hostingPasswordConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Enter the password again"><p id="hostingMigrationError" class="auth-feedback error" style="display:none"></p><div class="two" style="margin-top:16px"><button class="btn or" id="cancelHostingMigration" type="button">Cancel</button><button class="btn gn" id="confirmHostingMigration" type="button">Move data</button></div>`;
          dialog.showModal();
          $("#cancelHostingMigration").addEventListener("click", () => dialog.close());
          $("#confirmHostingMigration").addEventListener("click", async () => {
            const password = $("#hostingPassword").value;
            const confirmPassword = $("#hostingPasswordConfirm").value;
            const error = $("#hostingMigrationError");
            const button = $("#confirmHostingMigration") as HTMLButtonElement;
            error.style.display = "none";
            if (password.length < 8) { error.textContent = "Password must contain at least 8 characters."; error.style.display = "block"; return; }
            if (password !== confirmPassword) { error.textContent = "Passwords do not match."; error.style.display = "block"; return; }
            button.disabled = true;
            button.textContent = "Moving data...";
            try {
              await migrateToHosting(password);
              dialog.close();
              toast("Your data was copied to Namecheap successfully");
            } catch (migrationError) {
              const message = migrationError instanceof Error ? migrationError.message : "Could not move your data. Please try again.";
              error.textContent = message;
              error.style.display = "block";
            } finally {
              button.disabled = false;
              button.textContent = "Move data";
            }
          });
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
      [
        "Settings",
        "<svg class=\"menu-setting-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z\"/><path d=\"M19.4 15.2a1.7 1.7 0 0 0 1.1-1.6v-1.2a1.7 1.7 0 0 0-1.1-1.6l-.8-.3a7 7 0 0 0-.6-1.4l.3-.8a1.7 1.7 0 0 0-.4-1.9l-.9-.9a1.7 1.7 0 0 0-1.9-.4l-.8.3a7 7 0 0 0-1.4-.6l-.3-.8A1.7 1.7 0 0 0 11 3.1H9.8a1.7 1.7 0 0 0-1.6 1.1l-.3.8a7 7 0 0 0-1.4.6l-.8-.3a1.7 1.7 0 0 0-1.9.4l-.9.9a1.7 1.7 0 0 0-.4 1.9l.3.8a7 7 0 0 0-.6 1.4l-.8.3a1.7 1.7 0 0 0-1.1 1.6v1.2a1.7 1.7 0 0 0 1.1 1.6l.8.3a7 7 0 0 0 .6 1.4l-.3.8a1.7 1.7 0 0 0 .4 1.9l.9.9a1.7 1.7 0 0 0 1.9.4l.8-.3a7 7 0 0 0 1.4.6l.3.8a1.7 1.7 0 0 0 1.6 1.1H11a1.7 1.7 0 0 0 1.6-1.1l.3-.8a7 7 0 0 0 1.4-.6l.8.3a1.7 1.7 0 0 0 1.9-.4l.9-.9a1.7 1.7 0 0 0 .4-1.9l-.3-.8a7 7 0 0 0 .6-1.4Z\"/></svg>",
        [
          ["Currencies", "settings-currencies"],
          ["Notifications", "settings-notifications"],
          ["General Settings", "settings-general"],
          ["User Role", "settings-roles"],
          ["Notes", "settings-notes"],
        ],
      ],    ];

    const hdr = () => {
      const un = $("#un");
      const ua = $("#ua");
      const signedInUser = auth.currentUser;
      const visibleName = signedInUser?.displayName || D.user.name;

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
      const r =
        location.hash.slice(1) ||
        "dashboard";

      const menu = $("#menu");

      if (!menu) return;

      const role = D.roles?.find((entry: any) => entry.id == (isWorkspaceOwner ? D.user.roleId : activeRoleId));
      const permissions: string[] = role?.permissions || (isWorkspaceOwner ? ["All permissions"] : []);
      const hasAllPermissions = isWorkspaceOwner || permissions.includes("All permissions");
      const navItems: any[] = M.map((item: any[]) => {
            if (Array.isArray(item[2])) {
              const children = item[2].filter((child: any[]) =>
                (isWorkspaceOwner || child[1] !== "settings-roles") &&
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
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      void signOut(auth);
    });
    const closeUserMenu = (event: MouseEvent) => {
      if (userMenuWrap && !userMenuWrap.contains(event.target as Node)) {
        userMenu?.classList.remove("open");
        avatarButton?.setAttribute("aria-expanded", "false");
      }
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
    ).printInvoice = (id: number) => openInvoice(id, true, true);

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

    cleanup = () => {
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

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "register") {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/invalid-credential": "Email বা password সঠিক নয়।",
        "auth/user-not-found": "এই email দিয়ে কোনো account পাওয়া যায়নি।",
        "auth/email-already-in-use": "এই email দিয়ে account আগে থেকেই আছে।",
        "auth/weak-password": "Password কমপক্ষে ৬ অক্ষরের হতে হবে।",
        "auth/invalid-email": "একটি সঠিক email address দিন।",
        "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      };
      setError(messages[code || ""] || "অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");
    const resetEmail = email.trim().toLowerCase();
    if (!resetEmail) {
      setError("Password reset link পেতে আগে email address লিখুন।");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setError("সঠিক email address লিখে আবার চেষ্টা করুন।");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setMessage("Reset link পাঠানোর অনুরোধ সফল হয়েছে। Inbox ও Spam/Junk folder দেখুন। Emailটি account-এ নিবন্ধিত না হলে link আসবে না।");
    } catch (err) {
      const code = (err as { code?: string }).code;
      const resetErrors: Record<string, string> = {
        "auth/invalid-email": "Email addressটি সঠিক নয়। ঠিক করে আবার চেষ্টা করুন।",
        "auth/user-not-found": "এই email দিয়ে কোনো account পাওয়া যায়নি। যে email দিয়ে account খুলেছেন সেটি দিন।",
        "auth/operation-not-allowed": "Password reset চালু নেই। Firebase Console-এর Authentication-এ Email/Password sign-in enable করতে হবে।",
        "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।",
        "auth/network-request-failed": "Internet সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
        "auth/invalid-continue-uri": "Reset link configuration-এ সমস্যা আছে। Firebase Console-এর email template পরীক্ষা করতে হবে.",
      };
      setError(resetErrors[code || ""] || `Reset email পাঠানো যায়নি${code ? ` (${code})` : ""}। Email ও internet সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">Welcome to <span>PRAN Sticker Zone</span></h1>
        <p className="auth-subtitle">{mode === "login" ? "Welcome back, Please login in to your account" : "Create your account to get started"}</p>
        <form onSubmit={submit}>
          {mode === "register" && <label className="auth-field"><span className="auth-icon"><UserRound size={19} /></span><input autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required /></label>}
          <label className="auth-field"><span className="auth-icon"><Mail size={19} /></span><input type="email" autoComplete="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="auth-field"><span className="auth-icon"><LockKeyhole size={19} /></span><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /><button className="auth-eye" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></label>
          {mode === "login" && <div className="auth-options"><label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label><button type="button" className="text-button" onClick={resetPassword} disabled={busy}>Forgot Password?</button></div>}
          {error && <p className="auth-feedback error" role="alert">{error}</p>}
          {message && <p className="auth-feedback success" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}</button>
        </form>
        <div className="auth-switch"><button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Create an account." : "Back to login."}</button></div>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setReady(true);
  }), []);

  if (!ready) return <div className="auth-loading" aria-label="Loading" />;
  if (!user) return <AuthScreen />;
  return <div className="signed-in-app"><POSApp /></div>;
}

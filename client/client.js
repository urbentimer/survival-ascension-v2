import { Client } from "https://cdn.jsdelivr.net/npm/colyseus.js@0.16.19/+esm";
import { GAME_SERVER } from "./config.js";

const $ = id => document.getElementById(id);
const serverInput = new URLSearchParams(location.search).get("server");
const defaultEndpoint = location.protocol === "https:" ? `wss://${location.host}` : `ws://${location.hostname || "localhost"}:2567`;
const endpoint = serverInput || GAME_SERVER || defaultEndpoint;
const client = new Client(endpoint);
let room = null, myId = "", state = null, keys = {}, lastInput = 0, lastShoot = 0, dashReady = true, paused = false;
const canvas = $("arena"), ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
const COLORS = ["#68d5e8", "#e8bd68", "#c58be8", "#82d49a", "#e88787", "#8eabed", "#e5a36b", "#d2d879"];
const upgrades = [ ["damage","Heavy weapon","+5 weapon damage"], ["fireRate","Rapid fire","+20% firing speed"], ["health","Vitality","+20 maximum HP and heal"], ["defence","Body armour","+2 defence"], ["speed","Adrenaline","+10% movement speed"] ];
function status(text, good=false){$("connection").textContent=text;$("connection").style.borderColor=good?"#4d9c68":"#8a6852";}
function message(text){$("lobbyMessage").textContent=text;$("gameMessage").textContent=text;}
function showOverlay(title,text){$("overlay").classList.remove("hidden");$("overlayTitle").textContent=title;$("overlayText").textContent=text;$("upgradeChoices").innerHTML="";$("nextStage").classList.add("hidden");}
function hideOverlay(){$("overlay").classList.add("hidden");}
function playerName(){return $("name").value.trim().slice(0,18)||"Survivor";}
async function createRoom(){try{status("Connecting…");room=await client.create("survival",{name:playerName()});connected();}catch(e){status("Connection failed");message(e.message||"Could not create room. Check the server URL and try again.");}}
async function joinRoom(){const code=$("roomCode").value.trim();if(!code)return message("Enter the invitation code first.");try{status("Joining…");room=await client.joinById(code,{name:playerName()});connected();}catch(e){status("Join failed");message(e.message||"Could not join room. Check the code and server.");}}
function connected(){myId=room.sessionId;status("Connected · "+room.roomId,true);$("lobby").classList.remove("hidden");$("gameArea").classList.remove("hidden");$("invite").classList.remove("hidden");$("codeDisplay").textContent=room.roomId;$("roomCount").textContent="Room connected";message("Connected. Share the invitation code with your friends.");
 room.onStateChange(s=>{state=s;renderState();});
 room.onLeave(code=>{status("Disconnected");message("You left the room ("+code+").");room=null;$("gameArea").classList.add("hidden");$("lobby").classList.remove("hidden");});
 room.onError((code,msg)=>message("Room error: "+msg));
}
$("create").onclick=createRoom;$("join").onclick=joinRoom;
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText(room.roomId);$("copy").textContent="Copied!";}catch{$("copy").textContent="Code: "+room.roomId;}};
$("startGame").onclick=()=>room?.send("start");$("nextStage").onclick=()=>room?.send("nextStage");
$("leave").onclick=()=>room?.leave();
function renderState(){if(!state||!room)return;
 const players=[...state.players.values()],me=state.players.get(myId),host=state.hostId===myId;
 $("lobbyPlayers").innerHTML=players.map(p=>`<span class="pill">${escapeHtml(p.name)} ${p.isHost?"★":""}</span>`).join("");
 $("team").innerHTML=players.map(p=>`<span class="pill" style="border-color:${p.color}">${escapeHtml(p.name)} · ${p.alive?Math.ceil(p.hp)+" HP":"DOWN"} · Lv.${p.level}</span>`).join("");
 $("roomCount").textContent=players.length+" / 8 survivors";
 $("startGame").classList.toggle("hidden",!host||state.phase!=="lobby");
 $("stage").textContent=state.stage;$("level").textContent=me?.level||1;$("hp").textContent=me?Math.ceil(me.hp)+" / "+me.maxHp:"—";$("gold").textContent=me?me.kills*2:0;$("kills").textContent=me?.kills||0;
 $("xpText").textContent=me?me.xp+" / "+me.xpNext:"0 / 30";$("xpBar").style.width=me?Math.min(100,me.xp/me.xpNext*100)+"%":"0%";
 const ranked=players.slice().sort((a,b)=>b.kills-a.kills || (a.killLeadSince||Number.MAX_SAFE_INTEGER)-(b.killLeadSince||Number.MAX_SAFE_INTEGER) || String(a.name).localeCompare(String(b.name)));
 const crownLeader=ranked.length?ranked[0]:null;
 const board=$("scoreboard");
 const rows=ranked.map((p,i)=>`<tr class="${i===0&&p.kills>0?"leader":""}"><td>${i===0&&p.kills>0?"👑 ":""}${i+1}. ${escapeHtml(p.name)}${p.sessionId===myId?" (YOU)":""}</td><td>${p.kills}</td><td>${Math.round(p.bossDamage||0)}</td><td>${p.revives||0}</td></tr>`).join("");
 board.innerHTML=`<h3>${state.phase==="cleared"?"MATCH RESULTS":"LIVE KILL LEADERBOARD"}</h3><table><thead><tr><th>Survivor</th><th>Kills</th><th>Boss dmg</th><th>Revives</th></tr></thead><tbody>${rows}</tbody></table><div class="scorehint">Team kills: ${state.totalKills||0} · Press TAB to toggle</div>`;
 board.classList.toggle("hidden",!scoreboardOpen && state.phase!=="cleared");

 $("gameMessage").textContent=state.message;
 if(state.phase==="lobby"){showOverlay("Waiting for host","Share code "+state.roomCode+" with friends. The host can start when ready.");}
 else if(state.phase==="cleared"){showOverlay("STAGE "+state.stage+" CLEARED!","The Undead King has fallen. The host can launch the next stage.");$("nextStage").classList.toggle("hidden",!host);}
 else if(state.phase==="playing"){
  if(me&&!me.alive)showOverlay("YOU ARE DOWN","A teammate can come close and press E to revive you.");
  else if(me && me.xp >= me.xpNext) showUpgradeChoices(me);
  else hideOverlay();
 }
}

function showUpgradeChoices(me){
 if($("overlayTitle").textContent==="LEVEL UP!") return;
 showOverlay("LEVEL UP!", "Choose one upgrade. Your XP is spent when you select it.");
 const box=$("upgradeChoices");
 for(const [id,title,desc] of upgrades){
  const b=document.createElement("button");b.className="button upgrade";b.innerHTML=`<b>${title}</b><div class="muted" style="font-size:12px;margin-top:4px">${desc}</div>`;
  b.onclick=()=>{room?.send("upgrade",{id});$("upgradeChoices").innerHTML="<span class='muted'>Upgrade selected…</span>";};box.appendChild(b);
 }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function aimAngle(me){return Math.atan2(mouse.y-me.y,mouse.x-me.x);}
let mouse={x:W/2,y:H/2};
let scoreboardOpen=false;
canvas.addEventListener("mousemove",e=>{const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*W/r.width;mouse.y=(e.clientY-r.top)*H/r.height;});
window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(k==="tab"){e.preventDefault();scoreboardOpen=!scoreboardOpen;if(state?.phase!=="cleared")$("scoreboard").classList.toggle("hidden",!scoreboardOpen);}if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(k))e.preventDefault();keys[k===" "?"space":k]=true;if(k==="p")paused=!paused;if(k==="e")tryRevive();});
window.addEventListener("keyup",e=>{const k=e.key.toLowerCase();keys[k===" "?"space":k]=false;});
function tryRevive(){if(!state||!room)return;const me=state.players.get(myId);if(!me?.alive)return;const target=[...state.players.values()].find(p=>!p.alive&&Math.hypot(p.x-me.x,p.y-me.y)<85);if(target)room.send("revive",{targetId:target.sessionId});}
function sendControls(t){if(!room||!state||state.phase!=="playing"||paused)return;const me=state.players.get(myId);if(!me?.alive)return;const dt=Math.min(.1,(t-lastInput)/1000||.05);if(t-lastInput>45){const dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);room.send("input",{dx,dy,dt});lastInput=t;}if(t-lastShoot>170){room.send("shoot",{});lastShoot=t;}if(keys.space&&dashReady){dashReady=false;setTimeout(()=>dashReady=true,850);const dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);room.send("input",{dx:dx*2,dy:dy*2,dt:.12});keys.space=false;}}
function drawZombie(z){const skin=z.kind==="undeadKing"?"#626c4c":z.kind==="brute"?"#77664c":z.kind==="runner"?"#87946a":z.kind==="spitter"?"#61794d":"#78866b";ctx.save();ctx.translate(z.x,z.y);if(z.boss)ctx.scale(1.4,1.4);ctx.fillStyle="#0a100d";ctx.beginPath();ctx.ellipse(0,5,z.radius*1.1,z.radius*.8,0,0,7);ctx.fill();ctx.strokeStyle=skin;ctx.lineWidth=z.kind==="brute"?11:6;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-z.radius-8,10);ctx.moveTo(7,0);ctx.lineTo(z.radius+8,8);ctx.stroke();ctx.fillStyle=z.kind==="brute"?"#5e5947":"#48543f";ctx.beginPath();ctx.ellipse(0,4,z.radius*.75,z.radius,0,0,7);ctx.fill();ctx.fillStyle="#443a35";ctx.beginPath();ctx.moveTo(-z.radius*.7,-2);ctx.lineTo(z.radius*.7,-2);ctx.lineTo(z.radius*.45,z.radius+8);ctx.lineTo(-4,z.radius+6);ctx.closePath();ctx.fill();ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-z.radius*.7,z.radius*.63,0,7);ctx.fill();ctx.fillStyle="#c6e76d";ctx.shadowBlur=8;ctx.shadowColor="#a6d95d";ctx.beginPath();ctx.arc(-5,-z.radius*.72,2.5,0,7);ctx.arc(5,-z.radius*.72,2.5,0,7);ctx.fill();ctx.shadowBlur=0;if(z.kind==="undeadKing"){ctx.fillStyle="#c69c4a";ctx.beginPath();ctx.moveTo(-14,-z.radius);ctx.lineTo(-10,-z.radius-17);ctx.lineTo(-3,-z.radius);ctx.lineTo(5,-z.radius-20);ctx.lineTo(14,-z.radius);ctx.fill();}ctx.restore();ctx.fillStyle="#241f1c";ctx.fillRect(z.x-z.radius,z.y-z.radius-15,z.radius*2,4);ctx.fillStyle=z.boss?"#e44c4c":"#b5c26b";ctx.fillRect(z.x-z.radius,z.y-z.radius-15,z.radius*2*Math.max(0,z.hp/z.maxHp),4);if(z.boss){ctx.fillStyle="#fff";ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.fillText("UNDEAD KING",z.x,z.y-z.radius-21);}}
function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle="#17251c";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#253a2b";ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}for(let i=0;i<35;i++){const x=(i*139+43)%W,y=(i*97+17)%H;ctx.fillStyle="#263d2c";ctx.beginPath();ctx.arc(x,y,8,0,7);ctx.fill();}if(state){for(const z of state.zombies.values())drawZombie(z);for(const p of state.players.values()){ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=p.alive?p.color:"#555";ctx.shadowBlur=12;ctx.shadowColor=p.color;ctx.beginPath();ctx.arc(0,0,15,0,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#304d43";ctx.fillRect(-7,-9,14,18);ctx.restore();ctx.fillStyle="#fff";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(p.name+(p.sessionId===myId?" (YOU)":""),p.x,p.y-23);const leader=[...state.players.values()].sort((a,b)=>b.kills-a.kills||(a.killLeadSince||Number.MAX_SAFE_INTEGER)-(b.killLeadSince||Number.MAX_SAFE_INTEGER)||String(a.name).localeCompare(String(b.name)))[0];if(leader&&leader.kills>0&&leader.sessionId===p.sessionId){ctx.save();ctx.font="bold 23px serif";ctx.textAlign="center";ctx.shadowColor="#ffd84d";ctx.shadowBlur=12;ctx.fillStyle="#ffd84d";ctx.fillText("♛",p.x,p.y-35);ctx.restore();}if(!p.alive){ctx.fillStyle="#ff7777";ctx.fillText("DOWN · E TO REVIVE",p.x,p.y+30);}}ctx.fillStyle="#d5e3d2";ctx.font="14px sans-serif";ctx.textAlign="left";ctx.fillText("ABANDONED FOREST · STAGE "+state.stage,16,24);ctx.fillText("ZOMBIES: "+state.zombies.size,16,45);}}
function frame(t){sendControls(t);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);

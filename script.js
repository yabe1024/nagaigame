// --- Matter.js モジュール ---
const { Engine, Render, World, Bodies, Body, Events, Composite } = Matter;
const gameOverSound = new Audio('sound/うわわ.mp3');
let total_score = 0, enemyScore = 0;

// --- UUID（端末識別） ---
function getOrCreateUUID(){
    let id = localStorage.getItem("player_uuid");
    if(!id){
        if(window.crypto && crypto.randomUUID) id = crypto.randomUUID();
        else id = 'uuid-' + Date.now() + '-' + Math.floor(Math.random()*100000);
        localStorage.setItem("player_uuid", id);
    }
    return id;
}
const playerUUID = getOrCreateUUID();
console.log("playerUUID:", playerUUID);

// --- PeerJS / マルチ接続管理 ---
let peer = null;
// 単一の conn から配列管理へ変更（複数プレイヤー対応）
let connections = []; // DataConnection objects
let mediaCalls = {};  // peerId -> MediaConnection (for canvas stream sending)
let currentRoomId = null;
let isHost = false;

// UI: 動的に複数相手のvideoを格納する領域を作る（HTMLに #enemyVideos が無ければ作成）
(function ensureEnemyVideosContainer(){
    if(!document.getElementById("enemyVideos")){
        const vwrap = document.createElement("div");
        vwrap.id = "enemyVideos";
        Object.assign(vwrap.style,{position:"absolute", top:"100px", right:"20px", display:"flex", flexDirection:"column", gap:"8px"});
        document.body.appendChild(vwrap);
    }
})();

function addRemoteVideo(peerId, stream){
    // 既にある場合は更新
    let vid = document.getElementById("video-"+peerId);
    if(!vid){
        vid = document.createElement("video");
        vid.id = "video-"+peerId;
        vid.autoplay = true; vid.playsInline = true;
        vid.style.width = "300px"; vid.style.height = "180px"; vid.style.border = "2px solid white"; vid.style.borderRadius = "8px"; vid.style.background = "black";
        const wrap = document.getElementById("enemyVideos");
        wrap.appendChild(vid);
    }
    vid.srcObject = stream;
}

function removeRemoteVideo(peerId){
    const vid = document.getElementById("video-"+peerId);
    if(vid){
        vid.srcObject = null;
        vid.remove();
    }
}

// Peer初期化
function initPeer(providedId){
    if(peer){
        try{ peer.destroy(); }catch(e){ console.warn("peer destroy fail", e); }
        peer = null;
    }
    // PeerのIDは playerUUID （端末固定）にしておく
    peer = providedId ? new Peer(providedId) : new Peer(playerUUID);
    peer.on("open", id => {
        document.getElementById("myId").textContent = id;
        console.log("Peer open:", id);
        if(isHost && currentRoomId){
            alert("ルーム作成完了\nRoom ID: " + currentRoomId + "\nあなたのPeerID（参加者はこれで接続）: " + id);
        }
    });

    // データ接続を受け取る
    peer.on("connection", conn => {
        console.log("incoming data connection from", conn.peer);
        handleNewDataConnection(conn, false);
    });

    // メディア（canvas）受信用
    peer.on("call", call => {
        console.log("incoming media call from", call.peer);
        // 自分は canvas のストリームを送る側にもなれるし、受け取る側にもなれる。
        // 受信時は answer() を呼んでストリームを受け取り、video要素に割り当てる。
        call.answer(); // 受け取るだけ（画面は相手のcanvas）
        call.on("stream", stream => {
            addRemoteVideo(call.peer, stream);
        });
        call.on("close", ()=> removeRemoteVideo(call.peer));
        call.on("error", err => console.warn("call error", err));
    });

    peer.on("error", err => { console.error("peer error", err); alert("Peerエラー: "+err); });
}

// 新しいDataConnectionを受け取った／作成したときの処理
function handleNewDataConnection(conn, isOutgoing){
    conn.on("open", () => {
        console.log("data conn open to", conn.peer);
        // ルーム確認のため最初に自分のメタデータを送る
        const meta = { type:"hello", uuid:playerUUID, roomId:currentRoomId, isHost:isHost };
        try{ conn.send(meta); }catch(e){ console.warn("meta send failed", e); }
        // 保持
        if(!connections.find(c => c.peer === conn.peer)) connections.push(conn);

        // もし自分側でcanvasが存在すれば（相手が受け取るため）media callを開始
        tryAttachCanvasToPeer(conn.peer);
    });

    conn.on("data", data => {
        // data.type による分岐
        if(!data || !data.type) return;
        switch(data.type){
            case "hello": // 相手からの最初の挨拶（相手のルーム情報）
                console.log("hello from", conn.peer, data);
                // ルームが一致しない場合は退室を促す（簡易）
                if(currentRoomId && data.roomId !== currentRoomId){
                    // ルーム違いなら切断
                    console.warn("ルーム不一致: ", data.roomId, "!=", currentRoomId);
                    try{ conn.send({ type:"roomMismatch", message:"room mismatch" }); }catch(e){}
                    setTimeout(()=>{ try{ conn.close(); }catch(e){} }, 300);
                    return;
                }
                break;
            case "scoreUpdate":
                // 相手のスコア更新（個別）
                // デザイン上、最新を表示するだけ
                document.getElementById("enemyScoreDisplay").textContent = data.value;
                break;
            case "maxObjectReached":
                spawnRandomBalls(3);
                break;
            case "broadcast":
                // シンプルなブロードキャスト（中継機能）
                if(data.subtype === "chat"){
                    // チャットUIがあれば表示
                    const msg = `${conn.peer}: ${data.message}`;
                    appendChatMessage(msg);
                }
                break;
            case "roomMismatch":
                alert("相手からルーム不一致の通知を受け取りました。接続を切断します。");
                try{ conn.close(); }catch(e){}
                break;
            default:
                console.log("unknown data type", data.type, data);
        }
    });

    conn.on("close", () => {
        console.log("data conn closed:", conn.peer);
        connections = connections.filter(c => c !== conn);
        // 画面も削除
        removeRemoteVideo(conn.peer);
    });

    conn.on("error", err => {
        console.warn("data conn error", conn.peer, err);
    });
}

// 相手（peerId）へ自発的に接続する（join時など）
function connectToPeer(peerId){
    if(!peer) initPeer();
    if(connections.find(c=>c.peer===peerId)){
        console.log("already connected to", peerId); return;
    }
    const conn = peer.connect(peerId, { metadata: { roomId: currentRoomId, uuid: playerUUID } });
    handleNewDataConnection(conn, true);
    conn.on("open", () => {
        // request: 相手に自分のroomIdなどを伝える一方で、相手からcanvasストリームを受け取れるようにする
        // 受け取るための call は peer.on('call') で自動answerしている
    });
}

// canvas を各接続相手に個別に送る（peer.call）
function tryAttachCanvasToPeer(targetPeerId){
    const canvas = document.querySelector("canvas");
    if(!canvas || !canvas.captureStream) return;
    // 既に送っているなら再利用しない（MediaConnection があれば skip）
    if(mediaCalls[targetPeerId]) return;
    try{
        const stream = canvas.captureStream(30);
        const call = peer.call(targetPeerId, stream);
        mediaCalls[targetPeerId] = call;
        call.on("close", ()=>{ delete mediaCalls[targetPeerId]; removeRemoteVideo(targetPeerId); });
        call.on("error", e=>{ console.warn("media call error", e); delete mediaCalls[targetPeerId]; });
    }catch(e){
        console.warn("canvas capture or call failed", e);
    }
}

// すべての接続相手へcanvasストリームを送る（新規参加者が来たとき等に呼ぶ）
function broadcastCanvasToAll(){
    const canvas = document.querySelector("canvas");
    if(!canvas || !canvas.captureStream) return;
    const stream = canvas.captureStream(30);
    connections.forEach(conn=>{
        if(mediaCalls[conn.peer]) return; // 既に送信済み
        try{
            const call = peer.call(conn.peer, stream);
            mediaCalls[conn.peer] = call;
            call.on("close", ()=>{ delete mediaCalls[conn.peer]; removeRemoteVideo(conn.peer); });
            call.on("error", e=>{ console.warn("call error", e); delete mediaCalls[conn.peer]; });
        }catch(e){ console.warn("broadcast call failed", e); }
    });
}

// ルーム作成（ホスト）
document.getElementById("createRoom").onclick = () => {
    // ルームIDは任意の文字列
    const rid = prompt("作成するルームIDを入力してください（例: room01）:");
    if(!rid) return;
    currentRoomId = rid;
    isHost = true;
    // Peerは playerUUID を ID として新規作成（端末固定ID）
    initPeer(playerUUID);
    // ホストは接続を待ち、来た相手に自分のcanvasを送る準備をする
    // canvasが生成されたら自動的に broadcastCanvasToAll() を呼ぶタイミングを用意
    alert("ルームを作成しました。あなたの PeerID（参加者に渡してください）: " + playerUUID + "\nRoom ID: " + currentRoomId);
};

// ルーム参加（クライアント）
document.getElementById("joinRoom").onclick = () => {
    const rid = prompt("参加するルームIDを入力してください:");
    if(!rid) return;
    currentRoomId = rid;
    isHost = false;
    // Peer 初期化
    initPeer(playerUUID);
    // ホストのPeerIDを入力して接続する（簡易方式）
    const hostPeerId = prompt("接続するホストのPeerIDを入力してください（ホストのUUID）:");
    if(!hostPeerId) return;
    // 接続試行
    // 少し待って Peer が open してから接続
    const tryConn = setInterval(()=>{
        if(peer && peer.open){
            clearInterval(tryConn);
            connectToPeer(hostPeerId);
            // 接続後、ホストが canvas を送ってくれる想定（peer.on('call') で受け取る）
        }
    },100);
};

// --- 元々の conn ベースの関数を拡張して多人数対応 ---
// スコア送信（今は全員へ送信）
function sendScore(score){
    total_score = score; // 保持（念のため）
    connections.forEach(c=>{
        try{ if(c.open) c.send({ type:"scoreUpdate", value: score }); }catch(e){}
    });
}

// 最大オブジェクト達成通知（全員へ）
function notifyMaxObjectReached(){
    connections.forEach(c=>{
        try{ if(c.open) c.send({ type:"maxObjectReached" }); }catch(e){}
    });
}

// --- オブジェクト定義（元コードそのまま） ---
const objectDefinitions = [
    { texture: "img/cat1_circle.png", size: 25, label: "cat1_circle", originalWidth: 354, originalHeight: 348, score: 10, probability: 0.27 },
    { texture: "img/cat2.png", size: 30, label: "cat2", originalWidth: 354, originalHeight: 348, score: 20, probability: 0.22 },
    { texture: "img/cat3.png", size: 35, label: "cat3", originalWidth: 361, originalHeight: 344, score: 30, probability: 0.2 },
    { texture: "img/cat4.png", size: 40, label: "cat4", originalWidth: 357, originalHeight: 339, score: 40, probability: 0.16 },
    { texture: "img/cat5.png", size: 50, label: "cat5", originalWidth: 366, originalHeight: 355, score: 50, probability: 0.15 },
    { texture: "img/cat6.png", size: 60, label: "cat6", originalWidth: 349, originalHeight: 338, score: 60, probability: 0 },
    { texture: "img/cat7.png", size: 80, label: "cat7", originalWidth: 362, originalHeight: 362, score: 70, probability: 0 },
];

// --- Matter.js エンジン設定（ほぼ元のまま） ---
const engine = Engine.create();
const render = Render.create({
    element:document.getElementById("game-container"),
    engine:engine,
    options:{ wireframes:false, width:600, height:650, background:"img/game2202-.jpg" }
});

const width = render.options.width, height = render.options.height;
const ground = Bodies.rectangle(width/2,height,width,20,{isStatic:true});
const leftWall = Bodies.rectangle(0,height/2,20,height,{isStatic:true});
const rightWall = Bodies.rectangle(width,height/2,20,height,{isStatic:true});
const gameOverLine = Bodies.rectangle(width/2,20,width,5,{isStatic:true, render:{ fillStyle:"#ff0000" }});
World.add(engine.world,[ground,leftWall,rightWall,gameOverLine]);

// --- ランダム落下ボール ---
function createRandomFallingObject(x, y) {
    let rand = Math.random();
    let cumulativeProbability = 0;
    let filteredDefinitions = objectDefinitions.filter(def => def.label !== 'cat6' && def.label !== 'cat7');
    for (let i = 0; i < filteredDefinitions.length; i++) {
        cumulativeProbability += filteredDefinitions[i].probability;
        if (rand < cumulativeProbability) {
            const obj = filteredDefinitions[i];
            const scale = obj.size * 2 / Math.max(obj.originalWidth,obj.originalHeight);
            return Bodies.circle(x, y+50, obj.size, {label: obj.label, isStatic:true, render:{ sprite:{texture:obj.texture,xScale:scale,yScale:scale} } });
        }
    }
    // フォールバック
    const obj = filteredDefinitions[0];
    const scale = obj.size * 2 / Math.max(obj.originalWidth,obj.originalHeight);
    return Bodies.circle(x, y+50, obj.size, {label: obj.label, isStatic:true, render:{ sprite:{texture:obj.texture,xScale:scale,yScale:scale} } });
}

// 次のオブジェクト定義
function getNextObjectDefinition(label){
    for(let i=0;i<objectDefinitions.length;i++){
        if(objectDefinitions[i].label===label){
            if(i===objectDefinitions.length-1) return null;
            return objectDefinitions[(i+1)%objectDefinitions.length];
        }
    }
    return null;
}

// --- ボーナスボール生成 ---
function spawnRandomBalls(count){
    const minY = gameOverLine.position.y+20;
    const maxY = render.options.height/2;
    for(let i=0;i<count;i++){
        const x=Math.random()*width;
        const y=minY + Math.random()*(maxY-minY);
        const radius = 20 + Math.random()*15;
        const ball = Bodies.circle(x,y,radius,{
            label:"bonusBall", restitution:0.8,
            render:{ fillStyle:"#FFD700" }
        });
        World.add(engine.world,ball);
    }
}

// --- 衝突処理 ---
function mergeBodies(pair){
    const a=pair.bodyA, b=pair.bodyB;
    if(!a || !b) return;
    if(a.label==="bonusBall" || b.label==="bonusBall") return;
    if(a.label===b.label){
        const next=getNextObjectDefinition(a.label);
        if(next){
            total_score += next.score;
            updateScoreDisplay();
            const x=(a.position.x+b.position.x)/2;
            const y=(a.position.y+b.position.y)/2;
            const scale = next.size*2/Math.max(next.originalWidth,next.originalHeight);
            const newBody = Bodies.circle(x,y,next.size,{label: next.label, render:{ sprite:{ texture:next.texture, xScale:scale, yScale:scale} }});
            World.remove(engine.world,[a,b]);
            World.add(engine.world,newBody);
            if(next.label==="cat7") notifyMaxObjectReached();
        }
    }
}

function handleCeilingCollision(pair){
    if(pair.bodyA===gameOverLine||pair.bodyB===gameOverLine) endGame();
}

Events.on(engine,"collisionStart",e=>{
    e.pairs.forEach(p=>{
        if(p.bodyA && p.bodyB){
            if(p.bodyA.label===p.bodyB.label) mergeBodies(p);
            else if(p.bodyA===gameOverLine||p.bodyB===gameOverLine) handleCeilingCollision(p);
        }
    });
});

// --- 操作 ---
let nextObject=createRandomFallingObject(width/2,30), isFalling=false;
World.add(engine.world,nextObject);

window.addEventListener("keydown", e=>{
    if(isFalling) return;
    if(e.code==="Space"||e.code==="ArrowDown"){
        isFalling=true;
        Body.setStatic(nextObject,false);
        setTimeout(()=>{
            nextObject=createRandomFallingObject(width/2,30);
            isFalling=false;
            World.add(engine.world,nextObject);
        },2000);
        e.preventDefault();
    } else if(e.code==="ArrowLeft"){
        if(nextObject.position.x-nextObject.circleRadius>0) Body.translate(nextObject,{x:-20,y:0});
    } else if(e.code==="ArrowRight"){
        if(nextObject.position.x+nextObject.circleRadius<width) Body.translate(nextObject,{x:20,y:0});
    }
});

// --- スコア更新 ---
function updateScoreDisplay(){ 
    try{ $("#score-value").text(total_score); }catch(e){ document.getElementById("score-value").textContent = total_score; }
    // 変更点：全員へスコアを送信
    sendScore(total_score);
}

// --- ランキング管理 ---
function saveScore(score){
    let scores = JSON.parse(localStorage.getItem("ranking") || "[]");
    scores.push(score);
    scores.sort((a,b)=>b-a); // 高い順
    if(scores.length>10) scores=scores.slice(0,10);
    localStorage.setItem("ranking",JSON.stringify(scores));
    updateRankingDisplay();
}

function updateRankingDisplay(){
    let rankingList = document.getElementById("rankingList");
    if(!rankingList) return;
    const scores = JSON.parse(localStorage.getItem("ranking") || "[]");
    rankingList.innerHTML="";
    scores.forEach((s,i)=>{
        const li=document.createElement("li");
        li.textContent=s;
        rankingList.appendChild(li);
    });
}

// --- ゲームオーバー ---
function endGame(){ 
    try{ gameOverSound.currentTime=0; gameOverSound.play(); }catch(e){}
    alert("ゲームオーバー！スコア: "+total_score); 
    document.getElementById("game-container").style.display="none"; 
    saveScore(total_score);
}

// --- ランキングパネル生成（元コードと同じ） ---
if(!document.getElementById("rankingPanel")){
    const rankingPanel=document.createElement("div");
    rankingPanel.id="rankingPanel";
    Object.assign(rankingPanel.style,{
        position:"absolute",
        top:"420px",
        right:"20px",
        width:"300px",
        background:"rgba(0,0,0,0.6)",
        color:"white",
        padding:"10px",
        borderRadius:"8px",
        fontSize:"16px"
    });
    rankingPanel.innerHTML='<h3>ランキング</h3><ol id="rankingList"></ol>';
    document.body.appendChild(rankingPanel);
}
updateRankingDisplay();

// --- 補助: チャットUI（簡易） ---
function appendChatMessage(msg){
    let box = document.getElementById("chatBox");
    if(!box){
        box = document.createElement("div");
        box.id = "chatBox";
        Object.assign(box.style,{position:"absolute", bottom:"20px", left:"20px", width:"300px", height:"160px", overflowY:"auto", background:"rgba(0,0,0,0.6)", color:"white", padding:"8px", borderRadius:"8px", fontSize:"14px"});
        document.body.appendChild(box);
    }
    const p = document.createElement("div");
    p.textContent = msg;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
}

// チャット送信（全員へ broadcast 型で送る）
function sendChat(msg){
    connections.forEach(c=>{
        try{ if(c.open) c.send({ type:"broadcast", subtype:"chat", message: msg }); }catch(e){}
    });
    appendChatMessage("あなた: " + msg);
}

// --- canvas共有の自動開始トリガー ---
// canvas が DOM に出現したら、既存接続相手へストリームを送る仕組み
(function watchForCanvasThenBroadcast(){
    const canvasCheck = setInterval(()=>{
        const canvas = document.querySelector("canvas");
        if(canvas && canvas.captureStream){
            clearInterval(canvasCheck);
            // 既に接続があるなら送信
            setTimeout(()=>{ broadcastCanvasToAll(); }, 500);
            // 新しく接続が来たら handleNewDataConnection 内で tryAttachCanvasToPeer を呼ぶのでOK
        }
    },200);
})();

// --- エンジン開始 ---
Render.run(render); 
Engine.run(engine);

// --- 追加UI: 簡易チャット入力をページに貼る（もし存在しなければ） ---
(function addSimpleChatControls(){
    if(document.getElementById("chatInputUI")) return;
    const wrap = document.createElement("div");
    wrap.id = "chatInputUI";
    Object.assign(wrap.style,{position:"absolute", bottom:"200px", left:"20px", display:"flex", gap:"6px", alignItems:"center"});
    const input = document.createElement("input");
    input.id = "chatInputField";
    input.placeholder = "チャットを入力";
    input.style.padding = "6px";
    const btn = document.createElement("button");
    btn.textContent = "送信";
    btn.onclick = ()=>{ const v = input.value.trim(); if(v){ sendChat(v); input.value=''; } };
    wrap.appendChild(input); wrap.appendChild(btn);
    document.body.appendChild(wrap);
})();

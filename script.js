// --- Matter.js モジュール ---
const { Engine, Render, World, Bodies, Body, Events, Composite } = Matter;
const gameOverSound = new Audio('sound/うわわ.mp3');
let total_score = 0, enemyScore = 0;
let peer, conn;

// ランダムUUID生成（各端末固有のID）
function generateUUID() {
    return 'xxxx-xxxx-xxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16));
}


// --- PeerJS ルーム作成・接続 ---
document.getElementById("createRoom").onclick = () => {
    const roomName = prompt("ルーム名を入力してください"); // ルーム名入力
    if(!roomName) return alert("ルーム名を入力してください");
    
    const myId = generateUUID(); // 固有ID生成
    peer = new Peer(myId, { host: 'peerjs.com', port: 443, secure: true }); // PeerJS Cloud Server利用

    peer.on("open", id => {
        document.getElementById("myId").textContent = id;
        alert(`ルーム「${roomName}」作成完了！ このIDを相手に送ってください: ${id}`);
    });

    peer.on("connection", c => { 
        if(c.metadata?.roomName !== roomName) return c.close(); // 違うルームなら切断
        conn = c; 
        setupConnection(); 
    });

    peer.on("call", call => {
        call.answer(); 
        call.on("stream", stream => document.getElementById("enemyVideo").srcObject = stream);
    });
};


document.getElementById("joinRoom").onclick = () => {
    const roomName = prompt("参加するルーム名を入力してください");
    const targetId = document.getElementById("joinId").value.trim(); // 作成者のUUID
    if (!roomName || !targetId) return alert("ルーム名と相手のIDを入力してください");

    const myId = generateUUID();
    peer = new Peer(myId, { host: 'peerjs.com', port: 443, secure: true });

    peer.on("open", () => {
        conn = peer.connect(targetId, { metadata: { roomName: roomName } }); // ルーム名を渡す
        conn.on("open", setupConnection);

        peer.on("call", call => {
            call.answer();
            call.on("stream", stream => document.getElementById("enemyVideo").srcObject = stream);
        });
    });
};


// 接続確立後
function setupConnection() {
    alert("接続完了！");
    conn.on("data", data => {
        if(data.type==="scoreUpdate"){
            enemyScore = data.value;
            document.getElementById("enemyScoreDisplay").textContent = enemyScore;
        } else if(data.type==="maxObjectReached"){
            spawnRandomBalls(3);
        }
    });

    // canvas生成待機後、画面共有開始
    const canvasCheck = setInterval(() => {
        const canvas = document.querySelector("canvas");
        if(canvas && canvas.captureStream){
            clearInterval(canvasCheck);
            peer.call(conn.peer, canvas.captureStream(30));
        }
    }, 100);
}

// スコア送信
function sendScore(score){
    if(conn && conn.open) conn.send({ type:"scoreUpdate", value:score });
}

// 最大オブジェクト達成通知
function notifyMaxObjectReached(){
    if(conn && conn.open) conn.send({ type:"maxObjectReached" });
}

// --- オブジェクト定義 ---
const objectDefinitions = [
    { texture: "img/cat1_circle.png", size: 25, label: "cat1_circle", originalWidth: 354, originalHeight: 348, score: 10, probability: 0.27 },
    { texture: "img/cat2.png", size: 30, label: "cat2", originalWidth: 354, originalHeight: 348, score: 20, probability: 0.22 },
    { texture: "img/cat3.png", size: 35, label: "cat3", originalWidth: 361, originalHeight: 344, score: 30, probability: 0.2 },
    { texture: "img/cat4.png", size: 40, label: "cat4", originalWidth: 357, originalHeight: 339, score: 40, probability: 0.16 },
    { texture: "img/cat5.png", size: 50, label: "cat5", originalWidth: 366, originalHeight: 355, score: 50, probability: 0.15 },
    { texture: "img/cat6.png", size: 60, label: "cat6", originalWidth: 349, originalHeight: 338, score: 60, probability: 0 },
    { texture: "img/cat7.png", size: 80, label: "cat7", originalWidth: 362, originalHeight: 362, score: 70, probability: 0 },
];

// --- Matter.js エンジン設定 ---
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
        if(p.bodyA.label===p.bodyB.label) mergeBodies(p);
        else if(p.bodyA===gameOverLine||p.bodyB===gameOverLine) handleCeilingCollision(p);
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
    $("#score-value").text(total_score); 
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
    gameOverSound.currentTime=0; 
    gameOverSound.play(); 
    gameOverSound.volume=1; 
    alert("ゲームオーバー！スコア: "+total_score); 
    document.getElementById("game-container").style.display="none"; 
    saveScore(total_score);
}

// --- ランキングパネル生成 ---
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
updateRankingDisplay();

// --- エンジン開始 ---
Render.run(render); 
Engine.run(engine);


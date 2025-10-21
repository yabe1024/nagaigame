// Matter.js モジュール
const { Engine, Render, World, Bodies, Body, Events, Composite } = Matter;
const gameOverSound = new Audio('sound/うわわ.mp3');
let total_score = 0, enemyScore = 0;

let peer, conn;

// --- PeerJS ルーム作成・接続 ---
document.getElementById("createRoom").onclick = () => {
    peer = new Peer();
    peer.on("open", id => {
        document.getElementById("myId").textContent = id;
        alert("このIDを相手に送ってください: " + id);
    });
    peer.on("connection", c => { conn = c; setupConnection(); });
    peer.on("call", call => {
        call.answer(); 
        call.on("stream", stream => document.getElementById("enemyVideo").srcObject = stream);
    });
};

document.getElementById("joinRoom").onclick = () => {
    const targetId = document.getElementById("joinId").value.trim();
    if (!targetId) return alert("相手のIDを入力してください");
    peer = new Peer();
    peer.on("open", () => {
        conn = peer.connect(targetId);
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
            // 相手が最大オブジェクト達成 → ランダムボール出現
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


// オブジェクトの定義の配列
const objectDefinitions = [
    { texture: "img/cat1_circle.png", size: 25, label: "cat1_circle", originalWidth: 354, originalHeight: 348, score: 10, probability: 0.27 },
    { texture: "img/cat2.png", size: 30, label: "cat2", originalWidth: 354, originalHeight: 348, score: 20, probability: 0.22 },
    { texture: "img/cat3.png", size: 35, label: "cat3", originalWidth: 361, originalHeight: 344, score: 30, probability: 0.2 },
    { texture: "img/cat4.png", size: 40, label: "cat4", originalWidth: 357, originalHeight: 339, score: 40, probability: 0.16 },
    { texture: "img/cat5.png", size: 50, label: "cat5", originalWidth: 366, originalHeight: 355, score: 50, probability: 0.15 },
    { texture: "img/cat6.png", size: 60, label: "cat6", originalWidth: 349, originalHeight: 338, score: 60, probability: 0 },
    { texture: "img/cat7.png", size: 80, label: "cat7", originalWidth: 362, originalHeight: 362, score: 70, probability: 0 },
];

// ランダムな落下オブジェクト生成
function createRandomFallingObject(x, y) {
    let rand = Math.random();
    let cumulativeProbability = 0;
    let filteredDefinitions = objectDefinitions.filter(def => def.label !== 'cat6' && def.label !== 'cat7');

    for (let i = 0; i < filteredDefinitions.length; i++) {
        cumulativeProbability += filteredDefinitions[i].probability;
        if (rand < cumulativeProbability) {
            const objectDef = filteredDefinitions[i];
            const scale = objectDef.size * 2 / Math.max(objectDef.originalWidth, objectDef.originalHeight);
            const offsetY = 50;
            const object = Bodies.circle(x, y + offsetY, objectDef.size, {
                label: objectDef.label,
                isStatic: true,
                render: { sprite: { texture: objectDef.texture, xScale: scale, yScale: scale } }
            });
            return object;
        }
    }
}

// 次のオブジェクト定義を取得
function getNextObjectDefinition(label) {
    for (let i = 0; i < objectDefinitions.length; i++) {
        if (objectDefinitions[i].label === label) {
            if (i === objectDefinitions.length - 1) return null;
            return objectDefinitions[(i + 1) % objectDefinitions.length];
        }
    }
    return null;
}

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

function spawnRandomBalls(count){
    const minY = gameOverLine.position.y + 20; // ゲームオーバーラインより下
    const maxY = render.options.height / 2;   // 画面上半分の適当な範囲
    for(let i=0;i<count;i++){
        const x = Math.random() * width;
        const y = minY + Math.random() * (maxY - minY);
        const radius = 20 + Math.random()*15;
        const ball = Bodies.circle(x, y, radius, {
            label:"bonusBall",    // スコア対象外ラベル
            restitution:0.8,
            render:{ fillStyle:"#FFD700" }
        });
        World.add(engine.world,ball);
    }
}


// --- 衝突処理 ---
function mergeBodies(pair){
    const a=pair.bodyA, b=pair.bodyB;

    // bonusBall はスコア対象外
    if(a.label==="bonusBall" || b.label==="bonusBall") return;

    if(a.label===b.label){
        const next=getNextObjectDefinition(a.label);
        if(next){
            total_score += next.score;
            updateScoreDisplay();
            const x=(a.position.x+b.position.x)/2;
            const y=(a.position.y+b.position.y)/2;
            const scale = next.size*2/Math.max(next.originalWidth,next.originalHeight);
            const newBody = Bodies.circle(x,y,next.size,{
                label: next.label,
                render:{ sprite:{ texture:next.texture, xScale:scale, yScale:scale } }
            });
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

function updateScoreDisplay(){ $("#score-value").text(total_score); sendScore(total_score); }
function endGame(){ 
    gameOverSound.currentTime=0; 
    gameOverSound.play(); 
    gameOverSound.volume=1; 
    alert("ゲームオーバー！スコア: "+total_score); 
    document.getElementById("game-container").style.display="none"; 
}

Render.run(render); 
Engine.run(engine);



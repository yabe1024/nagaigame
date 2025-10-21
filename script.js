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

function setupConnection() {
    alert("接続完了！");
    conn.on("data", data => {
        if(data.type==="scoreUpdate"){
            enemyScore = data.value;
            document.getElementById("enemyScoreDisplay").textContent = enemyScore;
        }
    });
    const canvasCheck = setInterval(() => {
        const canvas = document.querySelector("canvas");
        if(canvas && canvas.captureStream){
            clearInterval(canvasCheck);
            peer.call(conn.peer, canvas.captureStream(30));
        }
    }, 100);
}

function sendScore(score){
    if(conn && conn.open) conn.send({ type:"scoreUpdate", value:score });
}

// --- ゲームロジック ---
const objectDefinitions = [
    { texture:"img/cat1_circle.png", size:25, label:"cat1_circle", originalWidth:354, originalHeight:348, score:10, probability:0.27 },
    { texture:"img/cat2.png", size:30, label:"cat2", originalWidth:354, originalHeight:348, score:20, probability:0.22 },
    { texture:"img/cat3.png", size:35, label:"cat3", originalWidth:361, originalHeight:344, score:30, probability:0.2 },
    { texture:"img/cat4.png", size:40, label:"cat4", originalWidth:357, originalHeight:339, score:40, probability:0.16 },
    { texture:"img/cat5.png", size:50, label:"cat5", originalWidth:366, originalHeight:355, score:50, probability:0.15 }
];

function createRandomFallingObject(x,y){
    let rand=Math.random(), cum=0;
    for(const def of objectDefinitions){
        cum += def.probability;
        if(rand<cum){
            const scale = def.size*2/Math.max(def.originalWidth, def.originalHeight);
            return Bodies.circle(x,y+50,def.size,{
                label:def.label, isStatic:true, render:{ sprite:{ texture:def.texture, xScale:scale, yScale:scale }}
            });
        }
    }
}

function getNextObjectDefinition(label){
    const i = objectDefinitions.findIndex(o=>o.label===label);
    if(i===-1||i===objectDefinitions.length-1) return null;
    return objectDefinitions[i+1];
}

// --- Matter.js エンジン設定 ---
const engine = Engine.create();
const render = Render.create({
    element:document.getElementById("game-container"),
    engine:engine,
    options:{ wireframes:false, width:600, height:650, background:"img/game2202-.jpg" }
});

const width = render.options.width, height=render.options.height;
const ground = Bodies.rectangle(width/2,height,width,20,{isStatic:true});
const leftWall = Bodies.rectangle(0,height/2,20,height,{isStatic:true});
const rightWall = Bodies.rectangle(width,height/2,20,height,{isStatic:true});
const gameOverLine = Bodies.rectangle(width/2,20,width,5,{isStatic:true, render:{ fillStyle:"#ff0000" }});
World.add(engine.world,[ground,leftWall,rightWall,gameOverLine]);

function mergeBodies(pair){
    const a=pair.bodyA, b=pair.bodyB;
    if(a.label===b.label){
        const next=getNextObjectDefinition(a.label);
        if(next){
            total_score+=next.score; updateScoreDisplay();
            const x=(a.position.x+b.position.x)/2, y=(a.position.y+b.position.y)/2;
            const scale=next.size*2/Math.max(next.originalWidth,next.originalHeight);
            const newBody=Bodies.circle(x,y,next.size,{label:next.label, render:{sprite:{texture:next.texture,xScale:scale,yScale:scale}}});
            World.remove(engine.world,[a,b]);
            World.add(engine.world,newBody);
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
function endGame(){ gameOverSound.currentTime=0; gameOverSound.play(); gameOverSound.volume=1; alert("ゲームオーバー！スコア: "+total_score); document.getElementById("game-container").style.display="none"; }

Render.run(render); Engine.run(engine);

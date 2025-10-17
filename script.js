// Matter.js のモジュールを取り込む
const { Engine, Render, World, Bodies, Body, Events, Composite } = Matter; 
const gameOverSound = new Audio('sound/うわわ.mp3'); 
let total_score = 0;



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

// エンジンとレンダラー作成
var engine = Engine.create();
var render = Render.create({
    element: document.getElementById('game-container'),
    engine: engine,
    options: {
        wireframes: false,
        background: 'img/game2202-.jpg'
    }
});

// ゲームオーバー画面
const gameOverDiv = document.createElement('div');
gameOverDiv.id = 'game-over';
gameOverDiv.style.display = 'none';
const gameOverImage = document.createElement('img');
gameOverImage.src = 'img/game1.jpg';
gameOverDiv.appendChild(gameOverImage);
document.body.appendChild(gameOverDiv);

// ★ 一番大きい丸をカウントする関数
function getLargestCircleCount(engine) {
    const bodies = Composite.allBodies(engine.world);
    let maxR = 0;
    for (const b of bodies) if (b.circleRadius && b.circleRadius > maxR) maxR = b.circleRadius;
    if (maxR === 0) return { maxR: 0, count: 0 };
    let count = 0;
    for (const b of bodies) if (b.circleRadius === maxR) count++;
    return { maxR, count };
}

// ★ 結果を画面の空きスペースに表示
function showGameResult(score, count) {
    const resultDiv = document.createElement('div');
    Object.assign(resultDiv.style, {
        position: 'absolute',
        bottom: '40px',
        right: '40px',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.6)',
        color: 'white',
        borderRadius: '8px',
        fontSize: '18px',
        zIndex: 9999,
        whiteSpace: 'pre-line',
    });
    resultDiv.innerText = `Score: ${score}\nNagaiの数: ${count}`;
    document.body.appendChild(resultDiv);
}

// ゲームオーバー処理
function endGame() {

    gameOverSound.currentTime = 0;
    gameOverSound.play();
    gameOverSound.volume = 1;

    gameOverDiv.style.display = 'block';
    document.getElementById('game-container').style.display = 'none';
    const { count } = getLargestCircleCount(engine);
    showGameResult(total_score, count);
}

// 画面サイズ取得
const width = render.options.width;
const height = render.options.height;

// 床・壁・天井
const ground = Bodies.rectangle(width / 2, height, width, 20, { isStatic: true });
const leftWall = Bodies.rectangle(0, height / 2, 20, height, { isStatic: true });
const rightWall = Bodies.rectangle(width, height / 2, 20, height, { isStatic: true });
const gameOverLine = Bodies.rectangle(width / 2, 20, width, 5, { isStatic: true, render: { fillStyle: '#ff0000' } }); // ←少し下げた

World.add(engine.world, [ground, leftWall, rightWall, gameOverLine]);

// 衝突時処理
function mergeBodies(pair) {
    const bodyA = pair.bodyA, bodyB = pair.bodyB;
    if (bodyA.label === bodyB.label) {
        const next = getNextObjectDefinition(bodyA.label);
        if (next) {
            total_score += next.score;
            $('#score').html(total_score.toString());

            const x = (bodyA.position.x + bodyB.position.x) / 2;
            const y = (bodyA.position.y + bodyB.position.y) / 2;
            const scale = next.size * 2 / Math.max(next.originalWidth, next.originalHeight);

            const newBody = Bodies.circle(x, y, next.size, {
                label: next.label,
                render: { sprite: { texture: next.texture, xScale: scale, yScale: scale } }
            });

            World.remove(engine.world, [bodyA, bodyB]);
            World.add(engine.world, newBody);
        }
    }


}

function handleCeilingCollision(pair) {
    if (pair.bodyA === gameOverLine || pair.bodyB === gameOverLine) endGame();
}

Events.on(engine, 'collisionStart', e => {
    e.pairs.forEach(p => {
        if (p.bodyA.label === p.bodyB.label) mergeBodies(p);
        else if (p.bodyA === gameOverLine || p.bodyB === gameOverLine) handleCeilingCollision(p);
    });
});

// 初期オブジェクト
let nextObject = createRandomFallingObject(width / 2, 30);
let isFalling = false;
World.add(engine.world, nextObject);

// 操作キー
window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !isFalling) {
        isFalling = true;



        Body.setStatic(nextObject, false);
        setTimeout(() => {
            nextObject = createRandomFallingObject(width / 2, 30);
            isFalling = false;
            World.add(engine.world, nextObject);
        }, 2000);
    } else if (event.code === 'ArrowLeft' && !isFalling) {
        if (nextObject.position.x - nextObject.circleRadius > 0)
            Body.translate(nextObject, { x: -20, y: 0 });
    } else if (event.code === 'ArrowRight' && !isFalling) {
        if (nextObject.position.x + nextObject.circleRadius < width)
            Body.translate(nextObject, { x: 20, y: 0 });
    } else if (event.code === 'ArrowDown' && !isFalling) {
        event.preventDefault();
        isFalling = true;
        Body.setStatic(nextObject, false);
        setTimeout(() => {
            nextObject = createRandomFallingObject(width / 2, 30);
            isFalling = false;
            World.add(engine.world, nextObject);
        }, 2000);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowDown') e.preventDefault();
});



// 実行
Render.run(render);
Engine.run(engine);

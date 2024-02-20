// Matter.js のモジュールを取り込む
const { Engine, Render, World, Bodies, Body, Events } = Matter;

let total_score = 0;

// オブジェクトの定義の配列
const objectDefinitions = [
    {
        texture: "img/cat1_circle.png",
        size: 25,
        label: "cat1_circle",
        originalWidth: 354, 
        originalHeight: 348, 
        score: 10,
        probability: 0.27 // 出現確率
    },
    {
        texture: "img/cat2.png",
        size: 30,
        label: "cat2",
        originalWidth: 354, 
        originalHeight: 348, 
        score: 20,
        probability: 0.22 // 出現確率
    },
    {
        texture: "img/cat3.png",
        size: 35,
        label: "cat3",
        originalWidth: 361, 
        originalHeight: 344, 
        score: 30,
        probability: 0.2 // 出現確率
    },
    {
        texture: "img/cat4.png",
        size: 40,
        label: "cat4",
        originalWidth: 357,
        originalHeight: 339, 
        score: 40,
        probability: 0.15 // 出現確率
    },
    {
        texture: "img/cat5.png",
        size: 50,
        label: "cat5",
        originalWidth: 366,
        originalHeight: 355,
        score: 50,
        probability: 0.16 // 出現確率
    },
    {
        texture: "img/cat6.png",
        size: 60,
        label: "cat6",
        originalWidth: 349,
        originalHeight: 338,
        score: 60,
        probability: 0 // 出現確率
    },
    {
        texture: "img/cat7.png",
        size: 80,
        label: "cat7",
        originalWidth: 362,
        originalHeight: 362,
        score: 70,
        probability: 0 // 出現確率
    },
];

// 次に落とすオブジェクトをランダムに選択して作成する関数
function createRandomFallingObject(x, y) {
    let rand = Math.random();
    let cumulativeProbability = 0;
    let filteredDefinitions = objectDefinitions.filter(def => def.label !== 'cat6' && def.label !== 'cat7');

    for (let i = 0; i < filteredDefinitions.length; i++) {
        cumulativeProbability += filteredDefinitions[i].probability;
        if (rand < cumulativeProbability) {
            const objectDef = filteredDefinitions[i];

            // スケールを計算（オブジェクトのサイズに合わせる）
            const scale = objectDef.size * 2 / Math.max(objectDef.originalWidth, objectDef.originalHeight);

            // 出現位置の調整
            const offsetY = 50; // 下へのオフセット
            const object = Bodies.circle(x, y + offsetY, objectDef.size, {
                label: objectDef.label,
                isStatic: true,
                render: {
                    sprite: {
                        texture: objectDef.texture,
                        xScale: scale,
                        yScale: scale
                    }
                }
            });
            return object;
        }
    }
}

// 次のオブジェクトを取得する関数
function getNextObjectDefinition(label) {
    for (let i = 0; i < objectDefinitions.length; i++) {
        if (objectDefinitions[i].label === label) {
            // 次のオブジェクトを配列から取得
            if (i === objectDefinitions.length-1) {
                return null;
            }
            return objectDefinitions[(i + 1) % objectDefinitions.length];
        }
    }
    return null;
}

// エンジンとレンダラーを作成
var engine = Engine.create();
var render = Render.create({
    element: document.getElementById('game-container'), // レンダリングする要素を指定
    engine: engine,
    options: { 
        wireframes: false, // ワイヤーフレーム表示を有効にする
        wireframeLineWidth: 2, // ワイヤーフレームの線の幅を指定
        wireframeLineColor: '#ff0000', // ワイヤーフレームの線の色を指定
        background: 'img/game2202-.jpg' // 背景画像のパスを指定
    }
});

// 画面の幅と高さを取得
const width = render.options.width;
const height = render.options.height;

// 床と壁を作成
const ground = Bodies.rectangle(width / 2, height, width, 20, { isStatic: true });
const leftWall = Bodies.rectangle(0, height / 2, 20, height, { isStatic: true });
const rightWall = Bodies.rectangle(width, height / 2, 20, height, { isStatic: true });

// 天井にゲームオーバーラインを追加
const gameOverLine = Bodies.rectangle(width / 2, 20, width, 5, { isStatic: true, render: { fillStyle: '#ff0000' } });

// 床と壁をワールドに追加
World.add(engine.world, [ground, leftWall, rightWall, gameOverLine]);

// 2つのオブジェクトが衝突した時に呼ばれる関数
function mergeBodies(pair) {
    const bodyA = pair.bodyA;
    const bodyB = pair.bodyB;

    // 同じラベルのオブジェクトが衝突した場合
    if (bodyA.label === bodyB.label) {
        const nextObjectDef = getNextObjectDefinition(bodyA.label);

        if (nextObjectDef) {
            total_score += nextObjectDef.score;
            $('#score').html(total_score.toString())
            const newX = (bodyA.position.x + bodyB.position.x) / 2;
            const newY = (bodyA.position.y + bodyB.position.y) / 2;

            // スケールを計算（オブジェクトのサイズに合わせる）
            const scale = nextObjectDef.size * 2 / Math.max(nextObjectDef.originalWidth, nextObjectDef.originalHeight);

            const newBody = Bodies.circle(newX, newY, nextObjectDef.size, {
                label: nextObjectDef.label,
                render: {
                    sprite: {
                        texture: nextObjectDef.texture,
                        xScale: scale,
                        yScale: scale
                    }
                }
            });

            World.remove(engine.world, [bodyA, bodyB]);
            World.add(engine.world, newBody);
        }
    }
}

// 天井にオブジェクトが衝突した時に呼ばれる関数
function handleCeilingCollision(pair) {
    const bodyA = pair.bodyA;
    const bodyB = pair.bodyB;

    if (bodyA === gameOverLine || bodyB === gameOverLine) {
        endGame();
    }
}

// 衝突イベントリスナーに天井との衝突を監視する処理を追加
Events.on(engine, 'collisionStart', event => {
    const pairs = event.pairs;
    pairs.forEach(pair => {
        if (pair.bodyA.label === pair.bodyB.label) {
            mergeBodies(pair);
        } else if (pair.bodyA === gameOverLine || pair.bodyB === gameOverLine) {
            handleCeilingCollision(pair);
        }
    });
});

// ゲームオーバー時の処理
function endGame() {
    // ここにゲームオーバー時の処理を記述（例: メッセージを表示、ページをリロード）
    alert("Game Over! Your total score is: " + total_score);
    location.reload(); // ページをリロード
}

// 初期の落下オブジェクトを作成
let nextObject = createRandomFallingObject(width / 2, 30);
// オブジェクトが落下中かどうか
let isFalling = false;
World.add(engine.world, nextObject);

window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !isFalling) {
        // スペースキーでオブジェクトを落下
        isFalling = true;
        Body.setStatic(nextObject, false);
        window.setTimeout(() => {
            nextObject = createRandomFallingObject(width / 2, 30);
            isFalling = false;
            World.add(engine.world, nextObject);
        }, 2000);
    } else if (event.code === 'ArrowLeft' && !isFalling) {
        // 左矢印キーでオブジェクトを左に移動
        if (nextObject.position.x - nextObject.circleRadius > 0) {
            Body.translate(nextObject, { x: -20, y: 0 });
        }
    } else if (event.code === 'ArrowRight' && !isFalling) {
        // 右矢印キーでオブジェクトを右に移動
        if (nextObject.position.x + nextObject.circleRadius < width) {
            Body.translate(nextObject, { x: 20, y: 0 });
        }
    } else if (event.code === 'ArrowDown' && !isFalling) {
        // 下矢印キーでオブジェクトを落下
        event.preventDefault(); // デフォルトのスクロール動作を無効化
        isFalling = true;
        Body.setStatic(nextObject, false);
        window.setTimeout(() => {
            nextObject = createRandomFallingObject(width / 2, 30);
            isFalling = false;
            World.add(engine.world, nextObject);
        }, 2000);
    }
});

// スペースキーのデフォルトの動作を無効化する関数
function preventSpacebarScroll(event) {
    if (event.code === 'Space') {
        event.preventDefault(); // デフォルトのスクロール動作を無効化
    }
}
function preventSpacebarScroll(event) {
    if (event.code === 'ArrowDown') {
        event.preventDefault(); // デフォルトのスクロール動作を無効化
    }
}

// キーボード入力イベントリスナーを設定
window.addEventListener('keydown', preventSpacebarScroll);

// レンダラーとエンジンを実行
Render.run(render);
Engine.run(engine);

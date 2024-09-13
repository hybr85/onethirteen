(async function () {
    const c = document.getElementById("c");
    const message = document.getElementById("message");
    const button = document.getElementById("b");
    const b = BABYLON;
    let scene;
    let xr;
    let score = 0;
    let addedtime; // when was last enemy added
    const engine = new b.Engine(c, true);

    window.addEventListener("resize", function () {
        engine.resize();
    });

    const createTree = function (data,indices,at=[0,0,0]) {
        const branching = [[1,1],[1,1],[2,2],[1,3],[2,1]]; // how many branches to create each level
        // vector ops i bet babylon can do this too
        const dot = (a,b) => a.reduce((acc,v,i)=>acc+v*b[i],0);
        const lsq = v => dot(v,v);
        const len = v => Math.sqrt(lsq(v));
        const norm = v => v.map(e => e/len(v));
        const add = (a,b) => a.map((v,i) => v+b[i]);
        const scale = (s,v) => v.map(e => s*e);
        const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const genuv = dir => { // perpendicular vectors
            let temp = dir.map(e=>e);
            temp=temp.map(e=>e==0?1:e);
            temp[1]++;
            // temp is perp to dir
            const u = norm(cross(dir,temp));
            return [u,norm(cross(u,dir))];
        }
        const genc = (at,dir,sections,rad) => { // generate circle
            const [u,v] = genuv(dir);

            const points = [];
            for (let i = 0 ; i < 2*Math.PI ; i += 2*Math.PI/sections) { // around the circle
                const cos = Math.cos(i);
                const sin = Math.sin(i);
                points.push(...add(
                    add(at,scale(cos*rad,u)),
                    scale(sin*rad,v)
                ));
            }
            return points;
        }
        const linkc = (data,coffset,parentoffset,sections) => { // link two circles
            const cdata = data.slice(coffset,coffset+3*sections);
            const parentdata = data.slice(parentoffset,parentoffset+3*sections);
            const parentidx = parentoffset/3;
            const cidx = coffset/3;
            const testpoint = cdata.slice(0,3);
            let mindist = Infinity;
            let minidx;
            for (let i = 0 ; i < sections ; i++) { // line up the points
                const parenttestpoint = parentdata.slice(i*3,i*3+3);
                const dist = lsq(add(testpoint,scale(-1,parenttestpoint)));
                if (dist < mindist) {
                    mindist = dist;
                    minidx = i;
                }
            }
            const indices = [];
            minidx++;
            for (let i = 0 ; i < sections ; i++) { // lots of fun!
                indices.push((cidx+i),(parentidx+(i+minidx)%sections),(cidx+(i+1)%sections));
                indices.push((cidx+(i+1)%sections),(parentidx+(i+minidx)%sections),(parentidx+(i+1+minidx)%sections));
            }
            return indices;
        }
        const addlimbs = (data,indices,sections,at,dir,level,parentoffset,coffset) => {
            const length = level+1;
            const rad = level/6;

            // trying different direction methods
            /* let [theta,phi] = [Math.acos(dir[2]),Math.sign(dir[1])*Math.acos(dir[0]/len([dir[0],dir[1]]))];
            theta+=(Math.random()-.5)/(level+1)*4;
            phi+=(Math.random()-.5)/(level+1)*4;
            dir = ([Math.sin(theta)*Math.cos(phi),Math.sin(theta)*Math.sin(phi),Math.cos(theta)]); */
            const [u,v] = genuv(dir);
            //const l = Math.random()*(6-level);
            //const ang = Math.random()*2*Math.PI;

            const nc = genc(at,dir,sections,rad);
            data.push(...nc);
            indices.push(...linkc(data,coffset,parentoffset,sections));
            if (level > 0) {
                let count = branching[level-1][0]+((branching[level-1][1]*Math.random()+.5))|0;
                let off = Math.random()*2*Math.PI/count;
                for (let i = 0 ; i < count ; i++) {
                    const ang = i*2*Math.PI/count+off+((Math.random()*2-1)*2*Math.PI/count/3);
                    const l = 1+Math.random()*.3-.15;
                    // i wish js had operator overloading
                    const ndir = norm(add(dir,add(scale(l*Math.sin(ang),u),scale(l*Math.cos(ang),v))));
                    addlimbs(data,indices,sections,add(at,scale(length,ndir)),ndir,level-1,coffset,data.length);
                }
            }
        }

        const sections = 6; // points per circle
        let dir = [0,1,0]; // start up
        let level = 5; // 5 levels
        data.push(...genc(at,dir,sections,level/5));
        let parentoffset = 0;
        let coffset = data.length;

        at = add(at,scale(level+4,dir));
        addlimbs(data,indices,sections,at,dir,level,parentoffset,coffset);
    }

    const createScene = async function () {
        const moonpos = new b.Vector3(0,200,0); // and light
        const scene = new b.Scene(engine);
        const camera = new b.FreeCamera("camera", b.Vector3.Zero(), scene);
        camera.minZ = .2;
        camera.position = new b.Vector3(0,1.7,0);

        //camera.attachControl(c,true);

        const light = new b.PointLight("light", moonpos, scene);
        light.intensity = 0.2;

        const ambient = new b.HemisphericLight("ambient", moonpos, scene);
        ambient.intensity = 0.2;

        const environment = scene.createDefaultEnvironment({
            createSkybox:false,
            createGround:false,
        }); // really don't know everything this does
        environment.setMainColor(new b.Color3(0,0,0));
        scene.clearColor = new b.Color3(0, 23/255, 51/255); // sky
        scene.ambientColor = new b.Color3(.2,.2,.2); // keep it dark
        const ground = b.MeshBuilder.CreateGround("ground", {height: 250, width: 250, subdivisions: 1});
        const groundMat = ground.material = new b.StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new b.Color3(0,0,0); // environment ground was too fadey
    
        xr = await scene.createDefaultXRExperienceAsync({ // woohoo
            floorMeshes: [ground],
            inputOptions: {
                doNotLoadControllerMeshes: true
            }
        });
        xr.pointerSelection.detach();
        const xrcamera = xr.baseExperience.camera;

        //const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);

        scene.fogMode = b.Scene.FOGMODE_LINEAR; // fade out far away

        scene.fogColor = new b.Color3(0,0,0);
        scene.fogDensity = 0.1;

        scene.fogStart = 180.0;
        scene.fogEnd = 200.0;

        const trees = new b.Mesh("custom", scene); // tree mesh
        const treePos = [];
        const treeIndices = [];
        const treeNormals = [];

        const circsep = 10; // space between rings of trees
        const sep = 10; // space between trees in the same ring (about)
        for (let i = 10 ; i < 100 ; i+=circsep) { // rings
            const coff = 2*Math.PI*Math.random();
            let step = 2*Math.PI/(2*Math.PI*i/sep|0);
            for (let j = 0 ; j < 2*Math.PI ; j+=step) { // around ring
                const theta = j+coff+(Math.random()*.5-.25)*step; // jitter
                const r = i+Math.random()*2-1;
                // keep the data indices right in the treegen function
                const tempIndices = [];
                const tempData = [];
                const index = treePos.length/3;
                createTree(tempData,tempIndices,[r*Math.sin(theta),0,r*Math.cos(theta)]);
                treeIndices.push(...tempIndices.map(e=>e+index)); // offset and add
                treePos.push(...tempData);
            }
        }

        b.VertexData.ComputeNormals(treePos, treeIndices, treeNormals); // for lighting
        const treeVertexData = new b.VertexData(); // blabla
        treeVertexData.positions = treePos;
        treeVertexData.indices = treeIndices;
        treeVertexData.normals = treeNormals;
        treeVertexData.applyToMesh(trees);
        //trees.convertToFlatShadedMesh();
        const treeMat = trees.material = new b.StandardMaterial("treeMat", scene);
        treeMat.diffuseColor = new b.Color3(105/255,71/255,42/255);
        treeMat.ambientColor = new b.Color3(122/255,82/255,49/255);
        treeMat.specularColor = new b.Color4(0,0, 0,0); // not shiny
        //trees.setEnabled(false);
        //shadowGenerator.addShadowCaster(trees); // nah

        const star = b.MeshBuilder.CreateSphere("star", { segments: 8, diameter: 1 }, scene);
        star.setEnabled(false);
        const moon = b.MeshBuilder.CreateSphere("moon", { segments: 8, diameter: 20 }, scene);
        moon.position = moonpos;
        const stars = [];
        for (let i = 0 ; i < 400 ; i++) {
            const s = star.clone();
            const r = 200;
            const phi = Math.random()*2*Math.PI;
            const theta = Math.random()*Math.PI/2.2; // keep them up more
            const sint = Math.sin(theta);
            s.position = new b.Vector3(r*sint*Math.cos(phi),r*Math.cos(theta),r*sint*Math.sin(phi));
            stars.push(s);
        }
        const starMesh = b.Mesh.MergeMeshes(stars, true, true, undefined, undefined, false);
        starMesh.setEnabled(true);
        starMesh.applyFog = false;
        moon.applyFog = false;
        moon.infiniteDistance = true;
        starMesh.infiniteDistance = true;
        const starMat = starMesh.material = moon.material = new b.StandardMaterial("starMat",scene);
        starMat.emissiveColor = new b.Color3(198/255, 190/255, 181/255);
        const glow = new b.GlowLayer("glow", scene);
        glow.intensity = .5;

        // gradient material not in babylon core :(
        //const outerMat = outer.material = new b.GradientMaterial("grad", scene);

        const outer = new b.Mesh("custom", scene); // something for the fog to fade against
        const outercount = 100; // how many points around the circle
        const outerPos = Array.from({length:outercount},(v,i) => { // like genc in tree function
            const r = 250; //radius
            const theta = i*4*Math.PI/outercount;
            const sin = Math.sin(theta);
            const cos = Math.cos(theta);
            return [r*cos,-10,r*sin,r*cos,40,r*sin];
        }).flat();
        // pattern for the circles
        const outerIndices = Array.from({length:outercount},(v,i) => [i,(i+1)%(outercount*2),(i+2)%(outercount*2)]).flat();
        const outerVertexData = new b.VertexData();
        outerVertexData.positions = outerPos;
        outerVertexData.indices = outerIndices;
        outerVertexData.applyToMesh(outer);
        const outerMat = outer.material = new b.StandardMaterial("outerMat",scene);
        outerMat.backFaceCulling= false; // easier than changing pattern
        outer.visibility = .8;
        
        // sword
        const blade = b.MeshBuilder.CreateBox("blade",{width:.03,height:.8,depth:.03},scene);
        blade.rotate(b.Axis.Y,Math.PI/4);
        blade.position.y += .46;
        const mat = new b.Matrix();
        mat.setRow(0, new b.Vector4(1,0,0,0));
        mat.setRow(1, new b.Vector4(0,1,0,0));
        mat.setRow(2, new b.Vector4(0,0,.2,0));
        mat.setRow(3, new b.Vector4(0,0,0,1));

        const tip = b.MeshBuilder.CreatePolyhedron("tip",{size:.015,type:1},scene); // blade tip

        const bladeMat = blade.material = tip.material = new b.StandardMaterial("crossMat", scene);
        //bladeMat.diffuseColor = new b.Color3(.7, 0.7, 0.7);
        bladeMat.ambientColor = new b.Color3(0.6, 0.6, 0.6);
        bladeMat.specularColor = new b.Color3(0.9, 0.9, 0.9);

        blade.freezeWorldMatrix(blade.computeWorldMatrix().multiply(mat));
        mat.setRow(3, new b.Vector4(0,.86,0,1)); // translate tip
        tip.freezeWorldMatrix(tip.computeWorldMatrix().multiply(mat));

        const handle = b.MeshBuilder.CreateCylinder("handle", {height:0.12,diameter:.03}, scene);
        const handleMat = handle.material = new b.StandardMaterial("handleMat", scene);
        handleMat.diffuseColor = new b.Color3(0.6, 0.1, 0);
        handleMat.ambientColor = new b.Color3(0.6, 0.1, 0);

        const cross = b.MeshBuilder.CreateCylinder("cross",{height:0.12,diameter:.033}, scene); // crossbar
        cross.rotate(b.Axis.Z, Math.PI / 2);
        cross.position.y+=.06;
        const end = b.MeshBuilder.CreateSphere("end", { segments: 16, diameter: 0.04 }, scene);
        const crossMat = cross.material = end.material = new b.StandardMaterial("crossMat", scene);
        crossMat.diffuseColor = new b.Color3(1, 0.8, 0);
        crossMat.ambientColor = new b.Color3(1, 0.8, 0);
        crossMat.specularColor = new b.Color3(1, 1, 0);
        
        const crossEnd1 = end.clone();
        const crossEnd2 = end.clone();
        crossEnd1.position.y+=.06;
        crossEnd2.position.y+=.06;
        crossEnd1.position.x+=.06;
        crossEnd2.position.x-=.06;
        //end.position.z -= .08;
        end.position.y -= .06;
        const sword = b.Mesh.MergeMeshes([cross,end,handle,crossEnd1,crossEnd2,blade,tip], true, true, undefined, undefined, true);
        sword.rotate(b.Axis.X, Math.PI / 2);
        sword.rotate(b.Axis.Y, Math.PI / 2);
        sword.setEnabled(false); // hide sword

        const stoc = (r, theta, phi) => [r*Math.sin(theta)*Math.cos(phi), r*Math.sin(theta)*Math.sin(phi), r*Math.cos(theta)]; // spherical to cartesian
        const ctos = (x, y, z) => [Math.sqrt(x*x+y*y+z*z), Math.acos(z/Math.sqrt(x*x+y*y+z*z)), Math.sign(y)*Math.acos(x/Math.sqrt(x*x+y*y))]; // and back again
        // enemy
        const body = b.MeshBuilder.CreateSphere("body", {segments:8, diameter:.3}, scene);
        const bodyMat = body.material = new b.StandardMaterial("bodyMat", scene);

        const leg = b.MeshBuilder.CreateCylinder("leg", {segments:8, diameterTop:.05, diameterBottom:.0, height:.04}, scene);
        const legs = [];
        for (let i = 0 ; i < 13 ; i++) {
            const ang = i*2*Math.PI/13;
            const newleg = leg.clone();
            newleg.position = new b.Vector3(...stoc(.147,ang,0)); // Math.sqrt(3)/2*.17
            newleg.position.y-=.075;
            newleg.rotate(b.Axis.Y,ang);
            newleg.rotate(b.Axis.X,-Math.PI/3);
            legs.push(newleg);
        }
        
        leg.setEnabled(false);

        const eye = b.MeshBuilder.CreateSphere("eye", {segments:8, diameter:.05});
        const eyeMat = eye.material = new b.StandardMaterial("", scene);
        eyeMat.emissiveColor = new b.Color3(1,1,0); // :)

        const eye2 = eye.clone();
        eye.position = new b.Vector3(...stoc(.15,.5,0.2));
        eye2.position = new b.Vector3(...stoc(.15,-.5,-0.2));

        const enemy = b.Mesh.MergeMeshes([body,eye,eye2,...legs], true, true, undefined, undefined, true);
        enemy.rotate(b.Axis.Y,-Math.PI/2);
        enemy.setEnabled(false); // hide enemy
        const swords = [];

        xr.input.onControllerAddedObservable.add((controller)=>{
            const swordClone = sword.clone();
            swordClone.setEnabled(true);
            swordClone.parent = controller.grip || controller.pointer;
            const intersector = b.MeshBuilder.CreateCylinder("",{diameter:.02,segments:8,height:.8},scene);
            intersector.rotate(b.Axis.X,Math.PI/2)
            intersector.position.z+=.48;
            intersector.parent = swordClone.parent;
            intersector.visibility = 0;
            swords.push(intersector);
            //shadowGenerator.addShadowCaster(swordClone); // nope
        });

        //when it breaks
        const halfsphere0 = b.MeshBuilder.CreateSphere("sphere", {slice: 0.5, segments:8,diameter:.3,sideOrientation: BABYLON.Mesh.DOUBLESIDE});
        halfsphere0.rotate(b.Axis.Z,Math.PI/2);
        halfsphere0.bakeCurrentTransformIntoVertices();
        const halfsphere1 = b.MeshBuilder.CreateSphere("sphere", {slice: 0.5, segments:8,diameter:.3,sideOrientation: BABYLON.Mesh.DOUBLESIDE});
        halfsphere1.rotate(b.Axis.Z,-Math.PI/2);
        halfsphere1.bakeCurrentTransformIntoVertices();
        halfsphere0.setEnabled(false);
        halfsphere1.setEnabled(false);
        const halfspheres = [halfsphere0,halfsphere1];
        const enemies = []; // simple object pool
        const enemiepieces = [[],[]];
        // states 0:rising 1:attacking
        const starttime = addedtime = performance.now();
        const defaultrot = enemy.rotation;
        console.log(enemiepieces);

        scene.registerBeforeRender(() => { // logic
            const now = performance.now();
            const time = now - starttime;
            const ar = scene.getAnimationRatio();
            if (now - addedtime > Math.max(2000-time/20,400)) { // add enemy
                addedtime = now;
                const ang = Math.PI/2+(Math.random()*2-1)*Math.PI*Math.min(1,time/40/1000); // spreads as time goes on
                const r = 7; // start 7m away
                const available = enemies.filter(e => !e.enabled)[0]; // get or create obj
                if (available) {
                    const e = available;
                    e.en.rotation = defaultrot;
                    e.en.rotate(b.Axis.Y,-ang-Math.PI/2); // who knows
                    e.en.position = new b.Vector3(r*Math.cos(ang),-.3,r*Math.sin(ang));
                    e.enabled = true;
                    e.state = 0; // rise
                    e.r = r;
                    e.ang = ang;
                    e.targetheight=Math.max(1,xrcamera.position.y-Math.random()*.5);
                }
                else {
                    const en = enemy.clone();
                    en.rotate(b.Axis.Y,-ang);
                    en.position = new b.Vector3(r*Math.cos(ang),-.3,r*Math.sin(ang));
                    en.setEnabled(true);
                    const intersector = b.MeshBuilder.CreateSphere("", {segments:4, diameter:.27});
                    intersector.parent = en;
                    intersector.visibility = 0;
                    enemies.push({en,r,ang,state:0,targetheight:Math.max(1,xrcamera.position.y-Math.random()*.5),intersector,enabled:true});
                }
            }
            const usedEnemies = enemies.filter(e => e.enabled);
            usedEnemies.forEach(e => {
                if (e.state) {
                    const dir = e.en.position.subtract(xrcamera.position).normalize(); // move
                    const y = e.en.position.y;
                    e.en.position.subtractInPlace(dir.scale(.03*ar));
                    e.en.position.y = y;
                    e.r = Math.sqrt((e.en.position.x-xrcamera.position.x)**2+(e.en.position.z-xrcamera.position.z)**2);
                    //e.en.position = new b.Vector3(e.r*Math.cos(e.ang),e.en.position.y,e.r*Math.sin(e.ang));
                }
                else e.en.position.y+=ar*.03; // rise
                if (e.en.position.y > e.targetheight) e.state = 1; // high enough
            });
            usedEnemies.forEach(e => {
                if (e.r < .37) { // close to player
                    score++;
                    e.enabled = false;
                    e.en.position.y-=10;
                    ((Math.random()+.7)|0)||die();
                }
            });
            usedEnemies.forEach(e => {
                swords.forEach(s => {
                    if (s.intersectsMesh(e.intersector,true)) {
                        score++;
                        for (let i = 0 ; i < 2 ; i++) {
                            const available = enemiepieces[i].filter(e => !e.enabled)[0];
                            if (available) {
                                available.enabled=true;
                                available.piece.visibility = 1;
                                available.piece.rotationQuaternion = s.absoluteRotationQuaternion;
                                available.piece.position = e.en.position.clone();
                                available.dir = new b.Vector3((i==0?-1:1),0,0).applyRotationQuaternionInPlace(s.absoluteRotationQuaternion);
                                available.startHeight = e.en.position.y;
                            }
                            else {
                                const piece = halfspheres[i].clone();
                                piece.position = e.en.position.clone();
                                piece.rotationQuaternion = s.absoluteRotationQuaternion;
                                piece.setEnabled(true);
                                enemiepieces[i].push({piece,enabled:true,dir:new b.Vector3((i==0?-1:1),0,0).applyRotationQuaternionInPlace(s.absoluteRotationQuaternion),startHeight:e.en.position.y});
                            }
                        }
                        e.enabled = false;
                        e.en.position = new b.Vector3(0,-10,0);
                        // buzz controller?
                    } // if sword hits dude
                });
            });
            enemiepieces.forEach(a => a.filter(e => e.enabled).forEach(p => { // update broken sphere
                p.piece.position.addInPlace(p.dir.scale(ar*.01));
                p.dir.y -= .1*ar;
                p.piece.visibility = Math.max(0,2*p.piece.position.y / p.startHeight);
                if (p.piece.position.y <= -1) p.enabled = false;
            }));
        });

        return scene;
    };

    const die = async () => {
        await xr.baseExperience?.exitXRAsync();
        scene.dispose();
        c.style.display = "none";
        message.style.display = "block";
        const oldscore = localStorage.getItem("onethirteenam-score") ?? 0;
        message.innerHTML = "You scored " + score + "<br>High score " + oldscore;
        if (score > oldscore) {
            message.innerHTML+="<br>New high score!";
            localStorage.setItem("onethirteenam-score",score);
        }
        message.innerHTML += "<br>Reload to play again";
    }

    button.addEventListener("click", async () => {
        try {
            message.innerHTML = "Loading ...";
            button.style.display="none";
            if (!await navigator.xr.isSessionSupported("immersive-vr")) throw "'immersive-vr' not supported";
            scene = await createScene();
            engine.runRenderLoop(() => scene.render());
            message.style.display="none";
        } catch (e) {
            message.innerHTML = e;
        }
    },{once:true});
})();

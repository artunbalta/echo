import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCharacter, poseCharacter, solveLeg, gaitFootTarget, reachCharacter } from '../src/game/three/character';
import { partitionDetail, partitionDetailMid, installBandFade, detailLayer } from '../src/game/world/detailLayer';
import { parcelMovement, initialMover, stepMover } from '../src/game/world/controller';
import { meadowSeed } from '../src/game/world/meadowLayer';
import { parcelEnvironmentLayers, parcelLayers } from '../src/game/world/parcelWorld';
import type { LayerContext } from '../src/game/world/PlanetWorld';
import type { MeasureChain } from '../src/game/world/measure';

test('the foot solver reaches its target with finite, connected knee and ankle rotations', () => {
  for (const z of [-.12,0,.12]) for (const height of [-.38,-.28,-.19]) {
    const p = solveLeg(z,height);
    const y = -.205*Math.cos(p.hip)-.205*Math.cos(p.hip+p.knee);
    const forward = -.205*Math.sin(p.hip)-.205*Math.sin(p.hip+p.knee);
    assert.ok(Math.abs(y-height)<1e-6 && Math.abs(forward-z)<1e-6);
    assert.ok(Math.abs(p.hip+p.knee+p.ankle)<1e-6, 'sole is level');
  }
  for (const height of [-2,0,2]) assert.ok(Object.values(solveLeg(0,height)).every(Number.isFinite));
});
test('elbows, knees and wrists are parented joints; running and jumping actually articulate them', () => {
  const rig=buildCharacter('you',true);
  assert.equal(rig.kneeL.parent,rig.legL); assert.equal(rig.footL.parent,rig.kneeL);
  let skins=0;
  rig.root.traverse(object=>{
    const surface=object as THREE.SkinnedMesh;
    if(!surface.isSkinnedMesh) return;
    skins++;
    const weights=surface.geometry.getAttribute('skinWeight');
    for(let i=0;i<weights.count;i++) assert.ok(Math.abs(weights.getX(i)+weights.getY(i)-1)<1e-6);
  });
  assert.equal(skins,4,'each limb has a continuous weighted skin');
  assert.equal(rig.elbowL.parent,rig.armL); assert.equal(rig.handL.parent,rig.elbowL);
  const pose={facing:'down',moving:true,animTime:.15,bob:0,lean:0,carrying:false,activity:null};
  poseCharacter(rig,{...pose,speed:1}); const walkElbow=rig.elbowL.rotation.x;
  poseCharacter(rig,{...pose,speed:1.6}); assert.ok(rig.elbowL.rotation.x<walkElbow-.6);
  poseCharacter(rig,{...pose,airborne:true}); assert.ok(rig.kneeL.rotation.x>1);
});
test('LOD partition preserves every placement exactly once, including rotations and scale', () => {
  const src=new Float32Array(48), low=new Float32Array(48),high=new Float32Array(48);
  for(let i=0;i<3;i++) new THREE.Matrix4().makeTranslation(i*20,0,0).toArray(src,i*16);
  const snapshot=src.slice();
  const result=partitionDetail(src,3,low,high,new THREE.Vector3());
  assert.deepEqual(result,{near:2,far:1}); assert.deepEqual(src,snapshot);
  assert.deepEqual(high.slice(0,32),src.slice(0,32));assert.deepEqual(low.slice(0,16),src.slice(32));
});
test('detail layer restores the culler buffer before the next frame and leaves shadow geometry alone', async () => {
  const source=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial(),2);
  source.boundingSphere=new THREE.Sphere(new THREE.Vector3(),100);
  source.setMatrixAt(0,new THREE.Matrix4());source.setMatrixAt(1,new THREE.Matrix4().makeTranslation(100,0,0));
  const original=(source.instanceMatrix.array as Float32Array).slice();
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(source);
  const ctx={scene,camera,layer:()=>({meshes:new Map([['boulder',source]])})} as unknown as LayerContext;
  const layer=detailLayer();await layer.build(ctx,new AbortController().signal);
  layer.beforeRender!(ctx);assert.equal(source.count,1);
  layer.update!(.016,ctx);assert.equal(source.count,2);assert.deepEqual(source.instanceMatrix.array,original);
  layer.beforeRender!(ctx);assert.equal(source.count,1);layer.dispose!();assert.equal(scene.children.length,1);
});
test('landing and play build the same environment; a preview creates no telemetry layer', () => {
  const environment=parcelEnvironmentLayers({inputEnabled:false}).map(l=>l.name);
  const playable=parcelLayers({chain:{} as MeasureChain}).map(l=>l.name);
  // A preview has neither the walk (telemetry), the interact layer (acts, C45), the way into a house (C54) nor sound (C56): only a playable parcel does.
  assert.deepEqual(playable.filter(n=>n!=='walk'&&n!=='interact'&&n!=='interior'&&n!=='sound'),environment);assert.ok(!environment.includes('walk'));assert.ok(!environment.includes('interact'));assert.ok(!environment.includes('interior'));assert.ok(!environment.includes('sound'),'a landing preview makes a sound');
  assert.equal(meadowSeed('seed','cell',1,2),meadowSeed('seed','cell',1,2));
  assert.notEqual(meadowSeed('seed','cell',1,2),meadowSeed('seed','other-cell',1,2));
});


test('a planted foot retreats at walking speed while the swing foot lifts clear', () => {
  const dt = .01, phase = Math.PI * 1.2;
  for (const run of [0,1]) {
    const a = gaitFootTarget(phase, 1, run);
    const b = gaitFootTarget(phase + dt * 9 * (1 + run * .7), 1, run);
    const speed = (run ? 4.2 : 1.65) / 1.6;
    assert.ok(a.stance && b.stance);
    assert.ok(Math.abs((b.forward-a.forward)/dt + speed) < .04, 'stance cancels body travel rather than skating forward');
    const swing = gaitFootTarget(Math.PI / 2, 1, run);
    assert.ok(!swing.stance && swing.lift > .06);
  }
});
test('parcel walking and running use physical speeds without changing the legacy mover default', () => {
  for (const tileM of [1,1.6,2]) for (const run of [false,true]) {
    let state = initialMover(0,0);
    const profile = parcelMovement(tileM);
    for(let i=0;i<180;i++) state = stepMover(state,{dx:1,dy:0,run,jump:false,activity:null},1/60,()=>true,undefined,profile);
    assert.ok(Math.abs(state.vx*tileM-(run?4.2:1.65))<1e-6);
    assert.equal(state.state,run?'run':'walk');
  }
});

test('the camera sweep catches thin trunks and allows the boom above a low rock', async () => {
  const {cylinderBoomLimit}=await import('../src/game/world/cameraObstacles');
  const trunk={x:0,y:0,z:2.13,radius:.04,height:6};
  const hit=cylinderBoomLimit([0,1.6,0],[0,0,1],8,[trunk]);
  assert.ok(hit<2 && hit>1.8,'a thin trunk between half-metre samples still stops the boom');
  assert.equal(cylinderBoomLimit([0,1.6,0],[0,0,1],8,[{...trunk,height:.4}]),8);
  assert.equal(cylinderBoomLimit([0,1.6,2.13],[0,0,1],8,[trunk]),0,'starting inside a prop is detectable');
  assert.equal(cylinderBoomLimit([0,1.6,0],[0,0,-1],8,[trunk]),8,'objects behind the camera ray do not shorten it');
});


test('arm contact reaches the actual surface after body yaw and scale without stretching its bones', () => {
  const rig=buildCharacter('you',true);
  rig.root.rotation.y=1.1;rig.root.scale.setScalar(1.6);rig.root.position.set(4,2,-3);
  rig.root.updateMatrixWorld(true);
  const target=rig.torso.localToWorld(new THREE.Vector3(.23,.20,.24));
  assert.ok(reachCharacter(rig,1,target));
  rig.root.updateMatrixWorld(true);
  assert.ok(rig.handR.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-5);
  assert.equal(rig.elbowR.position.length(),.17);assert.equal(rig.handR.position.length(),.15);
  assert.equal(reachCharacter(rig,1,new THREE.Vector3(100,100,100)),false);
});


test('LOD transition shares only the overlap band; every other asset is drawn exactly once', () => {
  const source=new Float32Array(48),low=new Float32Array(48),high=new Float32Array(48);
  for(const [i,x] of [20,34,50].entries()) new THREE.Matrix4().makeTranslation(x,0,0).toArray(source,i*16);
  const result=partitionDetail(source,3,low,high,new THREE.Vector3(),34,4);
  assert.deepEqual(result,{near:2,far:2});
  assert.equal(high[12],20);assert.equal(high[28],34);assert.equal(low[12],34);assert.equal(low[28],50);
});

test('a three-band LOD draws every asset exactly once outside the two overlap bands', () => {
  // The three-way partition is only correct if it is exhaustive AND exclusive: every instance lands
  // in at least one bucket, and in two only where a dither is mixing its neighbours. An instance
  // that lands in none is an asset that vanishes; one that lands in three is drawn three times.
  const inner={r:79,t:6.32}, outer={r:180,t:14.4};
  const at=[10,75,82,120,170,190,300];
  const source=new Float32Array(at.length*16);
  for(const [i,x] of at.entries()) new THREE.Matrix4().makeTranslation(x,0,0).toArray(source,i*16);
  const near=new Float32Array(source.length), mid=new Float32Array(source.length), far=new Float32Array(source.length);
  const result=partitionDetailMid(source,at.length,near,mid,far,new THREE.Vector3(),inner,outer);

  // Inner dither spans [72.68, 85.32] and outer [165.6, 194.4], so 75 and 82 straddle the first and
  // 170 and 190 straddle the second; 10 is detail alone, 120 mid alone, 300 ordinary alone.
  assert.deepEqual(result,{near:3,mid:5,far:3});
  const bucketed=(a:Float32Array,n:number)=>Array.from({length:n},(_,i)=>a[i*16+12]);
  assert.deepEqual(bucketed(near,result.near),[10,75,82]);
  assert.deepEqual(bucketed(mid,result.mid),[75,82,120,170,190]);
  assert.deepEqual(bucketed(far,result.far),[170,190,300]);

  // Exhaustive and at-most-twice, stated as the property rather than as the three lists above.
  for(const x of at){
    const n=bucketed(near,result.near).filter(v=>v===x).length+bucketed(mid,result.mid).filter(v=>v===x).length+bucketed(far,result.far).filter(v=>v===x).length;
    assert.ok(n===1||n===2,`an asset at ${x} m is drawn ${n} times`);
  }
});

test('the three bands of one class compile to three different programs', () => {
  // THE SILENT ONE. The base cache key is the constant 'natural-surface-v1' for every non-foliage
  // class, so a program is chosen by the fade suffix alone, and three returns the FIRST program
  // whose key matches. A mid material that collided with its own class's detail material would draw
  // with the detail form's fade and nothing would report it — the symptom is a forest drawn to the
  // horizon, which reads as a tuning problem rather than a cache collision.
  const inner={r:79,t:6.32}, outer={r:180,t:14.4};
  const keys=new Set<string>();
  for(const [band,from,to] of [['detail',null,inner],['mid',inner,outer],['ordinary',outer,null]] as const){
    const m=new THREE.MeshLambertMaterial();
    m.customProgramCacheKey=()=>'natural-surface-v1';
    installBandFade(m,band,from,to);
    keys.add(m.customProgramCacheKey());
  }
  assert.equal(keys.size,3,`three bands produced ${keys.size} distinct program keys: ${[...keys].join(' ')}`);
});

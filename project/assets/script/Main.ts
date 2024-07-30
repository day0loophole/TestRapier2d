import { _decorator, Color, Component, find, Graphics, instantiate, Label, Node, Prefab, size, Toggle, UITransform, v3 } from 'cc';
const { ccclass, property } = _decorator;

import RAPIER from '@dimforge/rapier2d-compat'

const TIMESTEP = 1 / 60;
const FIRST_LAYER_NUM = 3;

const BALL_GROUP = 0x00010002;
const LAND_ZONE_GROUP = 0x00020001;

const RENDER_DEBUG_ENABLED = false;

@ccclass('Main')
export class Main extends Component {
    @property(Prefab)
    nailPrefab: Prefab = null;

    @property(Prefab)
    landZonePrefab: Prefab = null;

    @property(Prefab)
    ballPrefab: Prefab = null;

    _nails: Node[] = [];
    _landZones: Node[] = [];

    private _world: RAPIER.World = null;

    private _nailParent: Node = null;
    private _landZoneParent: Node = null;
    private _ballsParent: Node = null;
    private _last_result: Label = null;

    private _renderDebugEnabled = RENDER_DEBUG_ENABLED;

    private _depth = 12;
    private _xGap = 80;
    private _yGap = -52;
    private _yOffset = 0;

    private _eventQueue: RAPIER.EventQueue = null;

    start() {
        this._nailParent = find("obstacles/nailParent", this.node);
        this._landZoneParent = find("obstacles/landZoneParent", this.node);
        this._ballsParent = find("ballsParent", this.node);
        this._last_result = find("last_result", this.node).getComponent(Label);

        this._initWorld().then(() => {

        });
    }

    async _initWorld() {
        await RAPIER.init();

        let gravity = { x: 0.0, y: -9.81 };
        this._world = new RAPIER.World(gravity);
        this._world.timestep = TIMESTEP;

        this._eventQueue = new RAPIER.EventQueue(true);

        let num = FIRST_LAYER_NUM;
        let idx = 1;

        let firstLandZoneX = 0;
        let firstLandZoneY = 0;
        let landZoneCount = 0;

        let nailWidth = 0;

        //nails
        this._nailParent.removeAllChildren();
        this._nails = [];
        for (let i = 0; i < this._depth; ++i) {
            let colNum = num + i;
            let y = this._yGap * i - (this._depth - 1) * this._yGap / 2 + this._yOffset;
            for (let j = 0; j < colNum; ++j) {
                let x = -this._xGap * (colNum - 1) / 2 + this._xGap * j;
                let o: Node;

                o = instantiate(this.nailPrefab);
                o.name = `o${idx}`;
                o.parent = this._nailParent;
                this._nails.push(o);
                o.position = v3(x, y);

                if (nailWidth == 0) {
                    nailWidth = o.getComponent(UITransform).width;
                }

                let colliderDesc = RAPIER.ColliderDesc.ball(nailWidth / 2);
                colliderDesc.friction = 0.5;
                colliderDesc.restitution = 0.7;
                colliderDesc.density = 1;
                colliderDesc.setTranslation(o.position.x, o.position.y);
                this._world.createCollider(colliderDesc);

                if (i == this._depth - 1) {
                    firstLandZoneY = y - nailWidth;
                    if (j == 0) {
                        firstLandZoneX = x + this._xGap / 2;
                    }
                    landZoneCount = colNum - 1;
                }

                idx++;
            }
        }


        //landZones
        this._landZoneParent.removeAllChildren();
        this._landZones = [];
        for (let i = 0; i < landZoneCount; ++i) {
            let l: Node;
            let lx = firstLandZoneX + i * this._xGap;
            l = instantiate(this.landZonePrefab);
            l.name = `l${i}`;
            l.parent = this._landZoneParent;
            l.getChildByName("rate").getComponent(Label).string = `x${(i + 1).toFixed(1)}`;

            let ut = l.getComponent(UITransform);
            ut.contentSize = size(this._xGap - nailWidth, ut.height);
            l.position = v3(lx, firstLandZoneY);

            let colliderDesc = RAPIER.ColliderDesc.cuboid(ut.contentSize.width / 2, ut.contentSize.height / 2);
            colliderDesc.isSensor = true;
            colliderDesc.collisionGroups = LAND_ZONE_GROUP;
            colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
            colliderDesc.setTranslation(l.position.x, l.position.y);
            let collider = this._world.createCollider(colliderDesc);

            //bind node
            (collider as any).userData = l;
        }
    }

    private onClick() {
        let ball = instantiate(this.ballPrefab);
        ball.parent = this._ballsParent;

        let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0.0, 512);
        rigidBodyDesc.gravityScale = 40;
        rigidBodyDesc.mass = 10;
        let rigidBody = this._world.createRigidBody(rigidBodyDesc);

        // Create a cuboid collider attached to the dynamic rigidBody.
        let colliderDesc = RAPIER.ColliderDesc.ball(16);
        colliderDesc.friction = 0.5;
        colliderDesc.restitution = 0.5;
        colliderDesc.density = 1;
        colliderDesc.collisionGroups = BALL_GROUP;

        ball.userData = rigidBody;
        const pos = rigidBody.translation();
        ball.position = v3(pos.x, pos.y);

        let collider = this._world.createCollider(colliderDesc, rigidBody);
        //bind node
        (collider as any).userData = ball;

        rigidBody.addForce({ x: -200.0, y: 200.0 }, true);
    }

    private onRenderDebugChecked(t:Toggle){
        this._renderDebugEnabled = t.isChecked;
    }

    renderDebug() {
        const g = this.getComponent(Graphics);
        g.lineWidth = 5;
        g.strokeColor = Color.GREEN;
        g.clear();
        
        if (!this._renderDebugEnabled)
            return;

        const { vertices, colors } = this._world.debugRender();
        for (let i = 0; i < vertices.length / 4; i += 1) {
            g.moveTo(vertices[i * 4], vertices[i * 4 + 1]);
            g.lineTo(vertices[i * 4 + 2], vertices[i * 4 + 3]);
            g.close();
            g.stroke();
        }
    }

    protected onDestroy(): void {
        this._world && this._world.free();
    }

    private onCollisionBegin(colliderA: RAPIER.Collider, colliderB: RAPIER.Collider) {
        //console.log('onCollisionBegin');
    }

    private onCollisionEnd(colliderA: RAPIER.Collider, colliderB: RAPIER.Collider) {
        //console.log('onCollisionEnd');
        let ballC = colliderA;
        let landZoneC = colliderB;
        if (colliderA.collisionGroups() == LAND_ZONE_GROUP) {
            landZoneC = colliderA;
            ballC = colliderB;
        }
        this._world.removeRigidBody(ballC.parent());
        let ball: Node = (ballC as any).userData;
        ball.removeFromParent();

        let landZone: Node = (landZoneC as any).userData;
        //console.log(`last land zone: ${landZone.getChildByName("rate").getComponent(Label).string}`);
        this._last_result.string = `Last Land Zone: ${landZone.getChildByName("rate").getComponent(Label).string}`;
    }

    update(deltaTime: number) {
        if (!this._world)
            return;

        // Ste the simulation forward.  
        this._world.step(this._eventQueue);

        // update node pos by rigidBody
        if (this._ballsParent.children.length > 0) {
            for (let ball of this._ballsParent.children) {
                let rigidBody: RAPIER.RigidBody = ball.userData;
                const pos = rigidBody.translation();
                ball.position = v3(pos.x, pos.y);
            }
        }

        //hanlder collision event
        this._eventQueue.drainCollisionEvents((handle1: RAPIER.ColliderHandle, handle2: RAPIER.ColliderHandle, started: boolean) => {
            let a = this._world.getCollider(handle1);
            let b = this._world.getCollider(handle2);
            //only handle collider that bind userData
            if ((a as any).userData && (b as any).userData) {
                if (started) {
                    this.onCollisionBegin(a, b);
                } else {
                    this.onCollisionEnd(a, b);
                }
            }
        });

        this.renderDebug();
    }
}
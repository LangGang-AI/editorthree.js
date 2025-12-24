import { Command } from '../Command.js';
import { ObjectLoader, Quaternion, Vector3 } from 'three';

class ArrayModifierCommand extends Command {

        /**
         * @param {Editor} editor
         * @param {THREE.Object3D|null} [sourceObject=null]
         * @param {Object} [config={}]
         * @constructor
         */
        constructor( editor, sourceObject = null, config = {} ) {

                super( editor );

                this.type = 'ArrayModifierCommand';
                this.name = editor.strings.getKey( 'command/ArrayModifier' );

                this.sourceObject = sourceObject;
                this.parent = sourceObject ? sourceObject.parent : null;

                this.config = Object.assign( {
                        count: 8,
                        radius: 2,
                        height: 4,
                        degreesPerStep: 30,
                        faceOutward: true
                }, config );

                this.clones = [];
                this.clonesJSON = [];
                this.parentUuid = this.parent ? this.parent.uuid : null;
        }

        execute() {

                if ( this.sourceObject === null ) return;

                const axisFrame = this.editor.ensureAxisFrame( this.sourceObject );

                if ( axisFrame === undefined ) return;

                const count = Math.max( 1, Math.floor( this.config.count ) );
                const parent = this.parent || this.sourceObject.parent || this.editor.scene;

                const right = new Vector3( axisFrame.right?.x ?? 1, axisFrame.right?.y ?? 0, axisFrame.right?.z ?? 0 ).normalize();
                const forward = new Vector3( axisFrame.forward?.x ?? 0, axisFrame.forward?.y ?? 0, axisFrame.forward?.z ?? 1 ).normalize();
                const up = new Vector3( axisFrame.up?.x ?? 0, axisFrame.up?.y ?? 1, axisFrame.up?.z ?? 0 ).normalize();

                const origin = new Vector3(
                        axisFrame.origin?.x ?? this.sourceObject.position.x,
                        axisFrame.origin?.y ?? this.sourceObject.position.y,
                        axisFrame.origin?.z ?? this.sourceObject.position.z
                );

                if ( this.clones.length === 0 && this.clonesJSON.length > 0 ) {

                        const loader = new ObjectLoader();
                        this.clones = this.clonesJSON.map( ( json ) => loader.parse( json ) );

                }

                if ( this.clones.length === 0 ) {

                        this.clones = [];

                        for ( let i = 0; i < count; i ++ ) {

                                this.clones.push( this.sourceObject.clone( true ) );

                        }

                }

                const heightStep = count > 1 ? this.config.height / ( count - 1 ) : 0;
                const radiansPerStep = this.config.degreesPerStep * Math.PI / 180;
                const outwardRotation = new Quaternion();

                this.editor.signals.sceneGraphChanged.active = false;

                for ( let i = 0; i < this.clones.length; i ++ ) {

                        const clone = this.clones[ i ];
                        const angle = i * radiansPerStep;

                        // Polar offsets mirror the sin/cos placement pattern in examples/webgl_shadowmesh.html (lines 195–207).
                        const radialOffset = right.clone().multiplyScalar( Math.cos( angle ) * this.config.radius )
                                .add( forward.clone().multiplyScalar( Math.sin( angle ) * this.config.radius ) );

                        const heightOffset = up.clone().multiplyScalar( heightStep * i );
                        const position = origin.clone().add( radialOffset ).add( heightOffset );

                        clone.position.copy( position );
                        clone.quaternion.copy( this.sourceObject.quaternion );

                        if ( this.config.faceOutward ) {

                                outwardRotation.setFromAxisAngle( up, angle );
                                clone.quaternion.multiply( outwardRotation );

                        }

                        this.editor.addObject( clone, parent );

                }

                this.editor.signals.sceneGraphChanged.active = true;
                this.editor.signals.sceneGraphChanged.dispatch();

                if ( this.clonesJSON.length === 0 ) {

                        this.clonesJSON = this.clones.map( ( clone ) => clone.toJSON() );

                }

        }

        undo() {

                this.editor.signals.sceneGraphChanged.active = false;

                for ( let i = 0; i < this.clones.length; i ++ ) {

                        this.editor.removeObject( this.clones[ i ] );

                }

                this.editor.signals.sceneGraphChanged.active = true;
                this.editor.signals.sceneGraphChanged.dispatch();

        }

        toJSON() {

                const output = super.toJSON( this );

                output.sourceUuid = this.sourceObject ? this.sourceObject.uuid : null;
                output.parentUuid = this.parent ? this.parent.uuid : null;
                output.config = this.config;
                output.clones = this.clonesJSON;

                return output;

        }

        fromJSON( json ) {

                super.fromJSON( json );

                this.config = json.config;
                this.clonesJSON = json.clones || [];

                this.sourceObject = this.editor.objectByUuid( json.sourceUuid );
                this.parentUuid = json.parentUuid || null;
                this.parent = this.parentUuid ? this.editor.objectByUuid( this.parentUuid ) : null;

        }

}

export { ArrayModifierCommand };

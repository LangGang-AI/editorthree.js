import * as THREE from 'three';

import { Config } from './Config.js';
import { Loader } from './Loader.js';
import { History as _History } from './History.js';
import { Strings } from './Strings.js';
import { Storage as _Storage } from './Storage.js';
import { Selector } from './Selector.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetGeometryCommand } from './commands/SetGeometryCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';

var _DEFAULT_CAMERA = new THREE.PerspectiveCamera( 50, 1, 0.01, 1000 );
_DEFAULT_CAMERA.name = 'Camera';
_DEFAULT_CAMERA.position.set( 0, 5, 10 );
_DEFAULT_CAMERA.lookAt( new THREE.Vector3() );

function Editor() {

	const Signal = signals.Signal; // eslint-disable-line no-undef

	this.signals = {

		// script

		editScript: new Signal(),

		// player

		startPlayer: new Signal(),
		stopPlayer: new Signal(),

		// xr

		enterXR: new Signal(),
		offerXR: new Signal(),
		leaveXR: new Signal(),

		// notifications

		editorCleared: new Signal(),

		savingStarted: new Signal(),
		savingFinished: new Signal(),

		transformModeChanged: new Signal(),
		snapChanged: new Signal(),
		spaceChanged: new Signal(),
		rendererCreated: new Signal(),
		rendererUpdated: new Signal(),
		rendererDetectKTX2Support: new Signal(),

		sceneBackgroundChanged: new Signal(),
		sceneEnvironmentChanged: new Signal(),
		sceneFogChanged: new Signal(),
		sceneFogSettingsChanged: new Signal(),
		sceneGraphChanged: new Signal(),
		sceneRendered: new Signal(),

		cameraChanged: new Signal(),
		cameraResetted: new Signal(),

		geometryChanged: new Signal(),

		objectSelected: new Signal(),
		objectFocused: new Signal(),

		objectAdded: new Signal(),
		objectChanged: new Signal(),
		objectRemoved: new Signal(),

		cameraAdded: new Signal(),
		cameraRemoved: new Signal(),

		helperAdded: new Signal(),
		helperRemoved: new Signal(),

		materialAdded: new Signal(),
		materialChanged: new Signal(),
		materialRemoved: new Signal(),

		scriptAdded: new Signal(),
		scriptChanged: new Signal(),
		scriptRemoved: new Signal(),

		windowResize: new Signal(),

		showHelpersChanged: new Signal(),
		refreshSidebarObject3D: new Signal(),
		refreshSidebarEnvironment: new Signal(),
		historyChanged: new Signal(),

		viewportCameraChanged: new Signal(),
		viewportShadingChanged: new Signal(),

		intersectionsDetected: new Signal(),

                pathTracerUpdated: new Signal(),
                selectionModeChanged: new Signal(),
                geometrySelectionChanged: new Signal(),
                commandTerminalVisibilityChanged: new Signal(),
                commandTerminalOutput: new Signal(),

        };

	this.config = new Config();
	this.history = new _History( this );
	this.selector = new Selector( this );
	this.storage = new _Storage();
	this.strings = new Strings( this.config );

	this.loader = new Loader( this );

	this.camera = _DEFAULT_CAMERA.clone();

	this.scene = new THREE.Scene();
	this.scene.name = 'Scene';

	this.sceneHelpers = new THREE.Scene();
	this.sceneHelpers.add( new THREE.HemisphereLight( 0xffffff, 0x888888, 2 ) );

	this.object = {};
	this.geometries = {};
	this.materials = {};
	this.textures = {};
	this.scripts = {};

	this.materialsRefCounter = new Map(); // tracks how often is a material used by a 3D object

	this.mixer = new THREE.AnimationMixer( this.scene );

        this.selected = null;
        this.helpers = {};
        this.selectionMode = 'object';
        this.geometrySelection = null;
        this.geometryClipboard = null;
        this.commandTerminalVisible = false;
        this.commandTerminalHistory = [];

        this.cameras = {};

	this.viewportCamera = this.camera;
	this.viewportShading = 'default';

	this.addCamera( this.camera );

}

Editor.prototype = {

	setScene: function ( scene ) {

		this.scene.uuid = scene.uuid;
		this.scene.name = scene.name;

		this.scene.background = scene.background;
		this.scene.environment = scene.environment;
		this.scene.fog = scene.fog;
		this.scene.backgroundBlurriness = scene.backgroundBlurriness;
		this.scene.backgroundIntensity = scene.backgroundIntensity;

		this.scene.userData = JSON.parse( JSON.stringify( scene.userData ) );

		// avoid render per object

		this.signals.sceneGraphChanged.active = false;

		while ( scene.children.length > 0 ) {

			this.addObject( scene.children[ 0 ] );

		}

		this.signals.sceneGraphChanged.active = true;
		this.signals.sceneGraphChanged.dispatch();

	},

	//

	ensureAxisFrame: function ( object ) {

		if ( object.userData === undefined ) object.userData = {};

		if ( object.userData.axisFrame === undefined ) {

			object.userData.axisFrame = {
				forward: { x: 0, y: 0, z: 1 },
				up: { x: 0, y: 1, z: 0 },
				right: { x: 1, y: 0, z: 0 },
				origin: { x: 0, y: 0, z: 0 }
			};

		}

		return object.userData.axisFrame;

	},

	//
	setSelectionMode: function ( mode ) {

		this.selectionMode = mode;
		this.signals.selectionModeChanged.dispatch( mode );

		if ( mode === 'object' ) {

			this.setGeometrySelection( null );

		}

	},

        setGeometrySelection: function ( selection ) {

                this.geometrySelection = selection;
                this.signals.geometrySelectionChanged.dispatch( selection );

        },

        copyGeometry: function ( geometry ) {

                // Mirrors the SetGeometryCommand.fromJSON geometry parse path (ObjectLoader.parseGeometries)
                // to keep clipboard reconstruction consistent with editor serialization.
                this.geometryClipboard = geometry.toJSON();

        },

        pasteGeometry: function ( targetObject ) {

                if ( this.geometryClipboard === null ) return null;

                const loader = new THREE.ObjectLoader();
                const parsed = loader.parseGeometries( [ this.geometryClipboard ] )[ this.geometryClipboard.uuid ];
                const geometry = parsed.clone();
                geometry.uuid = THREE.MathUtils.generateUUID();

                if ( targetObject.geometry && targetObject.geometry.name ) geometry.name = targetObject.geometry.name;

                return geometry;

        },

        toggleCommandTerminal: function ( visible ) {

                const nextVisibility = ( visible !== undefined ) ? visible : ! this.commandTerminalVisible;
                this.commandTerminalVisible = nextVisibility;
                this.signals.commandTerminalVisibilityChanged.dispatch( nextVisibility );

        },

        runCommandTerminal: function ( input ) {

                const sanitized = input.trim();

                if ( sanitized === '' ) return null;

                this.commandTerminalHistory.push( sanitized );

                if ( this.commandTerminalHistory.length > 50 ) {

                        this.commandTerminalHistory.shift();

                }

                const result = this.parseCommandTerminal( sanitized );

                this.signals.commandTerminalOutput.dispatch( result );

                return result;

        },

        parseCommandTerminal: function ( input ) {

                const result = { input: input, status: 'ok', message: '' };
                const tokens = input.split( /\s+/ );
                const command = tokens.shift().toLowerCase();

                const strings = this.strings;

                switch ( command ) {

                        case 'help':

                                result.message = strings.getKey( 'viewport/command/help' );
                                break;

                        case 'select': {

                                const query = tokens.join( ' ' );

                                if ( query === '' ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/select' ).replace( '{query}', query );
                                        break;

                                }

                                let target = this.scene.getObjectByName( query );

                                if ( target === undefined ) {

                                        target = this.objectByUuid( query );

                                }

                                if ( target === undefined ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/select' ).replace( '{query}', query );
                                        break;

                                }

                                this.ensureAxisFrame( target );
                                this.select( target );
                                result.message = strings.getKey( 'viewport/command/result/selected' ).replace( '{name}', target.name || target.uuid );
                                break;

                        }

                        case 'delete':
                        case 'del': {

                                const selected = this.selected;

                                if ( selected === null ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/selection_required' );
                                        break;

                                }

                                this.ensureAxisFrame( selected );
                                this.execute( new RemoveObjectCommand( this, selected ) );
                                result.message = strings.getKey( 'viewport/command/result/deleted' ).replace( '{name}', selected.name || selected.uuid );
                                break;

                        }

                        case 'focus': {

                                const selected = this.selected;

                                if ( selected === null ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/selection_required' );
                                        break;

                                }

                                this.ensureAxisFrame( selected );
                                this.focus( selected );
                                result.message = strings.getKey( 'viewport/command/result/focused' ).replace( '{name}', selected.name || selected.uuid );
                                break;

                        }

                        case 'mode': {

                                if ( tokens.length === 0 ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/mode' );
                                        break;

                                }

                                const mode = tokens[ 0 ].toLowerCase();
                                const allowedModes = [ 'object', 'vertex', 'edge', 'face' ];

                                if ( allowedModes.includes( mode ) === false ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/mode' );
                                        break;

                                }

                                this.setSelectionMode( mode );
                                result.message = strings.getKey( 'viewport/command/result/mode' ).replace( '{mode}', mode );
                                break;

                        }

                        case 'move': {

                                if ( tokens.length !== 3 || tokens.some( ( token ) => isNaN( parseFloat( token ) ) ) ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/move_arguments' );
                                        break;

                                }

                                const selected = this.selected;

                                if ( selected === null ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/selection_required' );
                                        break;

                                }

                                this.ensureAxisFrame( selected );

                                const position = new THREE.Vector3( parseFloat( tokens[ 0 ] ), parseFloat( tokens[ 1 ] ), parseFloat( tokens[ 2 ] ) );

                                this.execute( new SetPositionCommand( this, selected, position, selected.position.clone() ) );

                                const formatted = `${this.utils.formatNumber( position.x )}, ${this.utils.formatNumber( position.y )}, ${this.utils.formatNumber( position.z )}`;
                                result.message = strings.getKey( 'viewport/command/result/moved' ).replace( '{position}', formatted );
                                break;

                        }

                        case 'copygeom':
                        case 'copygeometry': {

                                const selected = this.selected;

                                if ( selected === null || selected.geometry === undefined ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/selection_required' );
                                        break;

                                }

                                this.ensureAxisFrame( selected );
                                this.copyGeometry( selected.geometry );
                                result.message = strings.getKey( 'viewport/command/result/copied' ).replace( '{name}', selected.name || selected.uuid );
                                break;

                        }

                        case 'pastegeom':
                        case 'pastegeometry': {

                                const selected = this.selected;

                                if ( selected === null || selected.geometry === undefined ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/selection_required' );
                                        break;

                                }

                                if ( this.geometryClipboard === null ) {

                                        result.status = 'error';
                                        result.message = strings.getKey( 'viewport/command/error/geometry_clipboard' );
                                        break;

                                }

                                const geometry = this.pasteGeometry( selected );
                                this.ensureAxisFrame( selected );
                                this.execute( new SetGeometryCommand( this, selected, geometry ) );
                                result.message = strings.getKey( 'viewport/command/result/pasted' ).replace( '{name}', selected.name || selected.uuid );
                                break;

                        }

                        default:

                                result.status = 'error';
                                result.message = strings.getKey( 'viewport/command/error/unknown' ).replace( '{command}', command );
                                break;

                }

                return result;

        },

        //

	addObject: function ( object, parent, index ) {

		var scope = this;

		object.traverse( function ( child ) {

			scope.ensureAxisFrame( child );

			if ( child.geometry !== undefined ) scope.addGeometry( child.geometry );
			if ( child.material !== undefined ) scope.addMaterial( child.material );

			scope.addCamera( child );
			scope.addHelper( child );

		} );

		if ( parent === undefined ) {

			this.scene.add( object );

		} else {

			parent.children.splice( index, 0, object );
			object.parent = parent;

		}

		this.signals.objectAdded.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	nameObject: function ( object, name ) {

		object.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	removeObject: function ( object ) {

		if ( object.parent === null ) return; // avoid deleting the camera or scene

		var scope = this;

		object.traverse( function ( child ) {

			scope.removeCamera( child );
			scope.removeHelper( child );

			if ( child.material !== undefined ) scope.removeMaterial( child.material );

		} );

		object.parent.remove( object );

		this.signals.objectRemoved.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	addGeometry: function ( geometry ) {

		this.geometries[ geometry.uuid ] = geometry;

	},

	setGeometryName: function ( geometry, name ) {

		geometry.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addMaterial: function ( material ) {

		if ( Array.isArray( material ) ) {

			for ( var i = 0, l = material.length; i < l; i ++ ) {

				this.addMaterialToRefCounter( material[ i ] );

			}

		} else {

			this.addMaterialToRefCounter( material );

		}

		this.signals.materialAdded.dispatch();

	},

	addMaterialToRefCounter: function ( material ) {

		var materialsRefCounter = this.materialsRefCounter;

		var count = materialsRefCounter.get( material );

		if ( count === undefined ) {

			materialsRefCounter.set( material, 1 );
			this.materials[ material.uuid ] = material;

		} else {

			count ++;
			materialsRefCounter.set( material, count );

		}

	},

	removeMaterial: function ( material ) {

		if ( Array.isArray( material ) ) {

			for ( var i = 0, l = material.length; i < l; i ++ ) {

				this.removeMaterialFromRefCounter( material[ i ] );

			}

		} else {

			this.removeMaterialFromRefCounter( material );

		}

		this.signals.materialRemoved.dispatch();

	},

	removeMaterialFromRefCounter: function ( material ) {

		var materialsRefCounter = this.materialsRefCounter;

		var count = materialsRefCounter.get( material );
		count --;

		if ( count === 0 ) {

			materialsRefCounter.delete( material );
			delete this.materials[ material.uuid ];

		} else {

			materialsRefCounter.set( material, count );

		}

	},

	getMaterialById: function ( id ) {

		var material;
		var materials = Object.values( this.materials );

		for ( var i = 0; i < materials.length; i ++ ) {

			if ( materials[ i ].id === id ) {

				material = materials[ i ];
				break;

			}

		}

		return material;

	},

	setMaterialName: function ( material, name ) {

		material.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addTexture: function ( texture ) {

		this.textures[ texture.uuid ] = texture;

	},

	//

	addCamera: function ( camera ) {

		if ( camera.isCamera ) {

			this.cameras[ camera.uuid ] = camera;

			this.signals.cameraAdded.dispatch( camera );

		}

	},

	removeCamera: function ( camera ) {

		if ( this.cameras[ camera.uuid ] !== undefined ) {

			delete this.cameras[ camera.uuid ];

			this.signals.cameraRemoved.dispatch( camera );

		}

	},

	//

	addHelper: function () {

		var geometry = new THREE.SphereGeometry( 2, 4, 2 );
		var material = new THREE.MeshBasicMaterial( { color: 0xff0000, visible: false } );

		return function ( object, helper ) {

			if ( helper === undefined ) {

				if ( object.isCamera ) {

					helper = new THREE.CameraHelper( object );

				} else if ( object.isPointLight ) {

					helper = new THREE.PointLightHelper( object, 1 );

					helper.matrix = new THREE.Matrix4();
					helper.matrixAutoUpdate = true;

					const light = object;
					const editor = this;

					helper.updateMatrixWorld = function () {

						light.getWorldPosition( this.position );

						const distance = editor.viewportCamera.position.distanceTo( this.position );
						this.scale.setScalar( distance / 30 );

						this.updateMatrix();
						this.matrixWorld.copy( this.matrix );

						const children = this.children;

						for ( let i = 0, l = children.length; i < l; i ++ ) {

							children[ i ].updateMatrixWorld();

						}

					};

				} else if ( object.isDirectionalLight ) {

					helper = new THREE.DirectionalLightHelper( object, 1 );

				} else if ( object.isSpotLight ) {

					helper = new THREE.SpotLightHelper( object );

				} else if ( object.isHemisphereLight ) {

					helper = new THREE.HemisphereLightHelper( object, 1 );

				} else if ( object.isSkinnedMesh ) {

					helper = new THREE.SkeletonHelper( object.skeleton.bones[ 0 ] );

				} else if ( object.isBone === true && object.parent && object.parent.isBone !== true ) {

					helper = new THREE.SkeletonHelper( object );

				} else {

					// no helper for this object type
					return;

				}

				const picker = new THREE.Mesh( geometry, material );
				picker.name = 'picker';
				picker.userData.object = object;
				helper.add( picker );

			}

			this.sceneHelpers.add( helper );
			this.helpers[ object.id ] = helper;

			this.signals.helperAdded.dispatch( helper );

		};

	}(),

	removeHelper: function ( object ) {

		if ( this.helpers[ object.id ] !== undefined ) {

			var helper = this.helpers[ object.id ];
			helper.parent.remove( helper );
			helper.dispose();

			delete this.helpers[ object.id ];

			this.signals.helperRemoved.dispatch( helper );

		}

	},

	//

	addScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) {

			this.scripts[ object.uuid ] = [];

		}

		this.scripts[ object.uuid ].push( script );

		this.signals.scriptAdded.dispatch( script );

	},

	removeScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) return;

		var index = this.scripts[ object.uuid ].indexOf( script );

		if ( index !== - 1 ) {

			this.scripts[ object.uuid ].splice( index, 1 );

		}

		this.signals.scriptRemoved.dispatch( script );

	},

	getObjectMaterial: function ( object, slot ) {

		var material = object.material;

		if ( Array.isArray( material ) && slot !== undefined ) {

			material = material[ slot ];

		}

		return material;

	},

	setObjectMaterial: function ( object, slot, newMaterial ) {

		if ( Array.isArray( object.material ) && slot !== undefined ) {

			object.material[ slot ] = newMaterial;

		} else {

			object.material = newMaterial;

		}

	},

	setViewportCamera: function ( uuid ) {

		this.viewportCamera = this.cameras[ uuid ];
		this.signals.viewportCameraChanged.dispatch();

	},

	setViewportShading: function ( value ) {

		this.viewportShading = value;
		this.signals.viewportShadingChanged.dispatch();

	},

	//

	select: function ( object ) {

		this.selector.select( object );

	},

	selectById: function ( id ) {

		if ( id === this.camera.id ) {

			this.select( this.camera );
			return;

		}

		this.select( this.scene.getObjectById( id ) );

	},

	selectByUuid: function ( uuid ) {

		var scope = this;

		this.scene.traverse( function ( child ) {

			if ( child.uuid === uuid ) {

				scope.select( child );

			}

		} );

	},

	deselect: function () {

		this.selector.deselect();

	},

	focus: function ( object ) {

		if ( object !== undefined ) {

			this.signals.objectFocused.dispatch( object );

		}

	},

	focusById: function ( id ) {

		this.focus( this.scene.getObjectById( id ) );

	},

	clear: function () {

		this.history.clear();
		this.storage.clear();

		this.camera.copy( _DEFAULT_CAMERA );
		this.signals.cameraResetted.dispatch();

		this.scene.name = 'Scene';
                this.scene.userData = {};
                this.scene.background = null;
                this.scene.environment = null;
                this.scene.fog = null;

                this.commandTerminalHistory = [];
                this.toggleCommandTerminal( false );

                var objects = this.scene.children;

		this.signals.sceneGraphChanged.active = false;

		while ( objects.length > 0 ) {

			this.removeObject( objects[ 0 ] );

		}

		this.signals.sceneGraphChanged.active = true;

		this.geometries = {};
		this.materials = {};
		this.textures = {};
		this.scripts = {};

		this.materialsRefCounter.clear();

		this.animations = {};
		this.mixer.stopAllAction();

		this.deselect();

		this.signals.editorCleared.dispatch();

	},

	//

	fromJSON: async function ( json ) {

		var loader = new THREE.ObjectLoader();
		var camera = await loader.parseAsync( json.camera );

		const existingUuid = this.camera.uuid;
		const incomingUuid = camera.uuid;

		// copy all properties, including uuid
		this.camera.copy( camera );
		this.camera.uuid = incomingUuid;

		delete this.cameras[ existingUuid ]; // remove old entry [existingUuid, this.camera]
		this.cameras[ incomingUuid ] = this.camera; // add new entry [incomingUuid, this.camera]

		if ( json.controls !== undefined ) {

			this.controls.fromJSON( json.controls );

		}

		this.signals.cameraResetted.dispatch();

		this.history.fromJSON( json.history );
		this.scripts = json.scripts;

		this.setScene( await loader.parseAsync( json.scene ) );

		if ( json.environment === 'Room' ||
			 json.environment === 'ModelViewer' /* DEPRECATED */ ) {

			this.signals.sceneEnvironmentChanged.dispatch( json.environment );
			this.signals.refreshSidebarEnvironment.dispatch();

		}

	},

	toJSON: function () {

		// scripts clean up

		var scene = this.scene;
		var scripts = this.scripts;

		for ( var key in scripts ) {

			var script = scripts[ key ];

			if ( script.length === 0 || scene.getObjectByProperty( 'uuid', key ) === undefined ) {

				delete scripts[ key ];

			}

		}

		// honor neutral environment

		let environment = null;

		if ( this.scene.environment !== null && this.scene.environment.isRenderTargetTexture === true ) {

			environment = 'Room';

		}

		//

		return {

			metadata: {},
			project: {
				shadows: this.config.getKey( 'project/renderer/shadows' ),
				shadowType: this.config.getKey( 'project/renderer/shadowType' ),
				toneMapping: this.config.getKey( 'project/renderer/toneMapping' ),
				toneMappingExposure: this.config.getKey( 'project/renderer/toneMappingExposure' )
			},
			camera: this.viewportCamera.toJSON(),
			controls: this.controls.toJSON(),
			scene: this.scene.toJSON(),
			scripts: this.scripts,
			history: this.history.toJSON(),
			environment: environment

		};

	},

	objectByUuid: function ( uuid ) {

		return this.scene.getObjectByProperty( 'uuid', uuid, true );

	},

	execute: function ( cmd, optionalName ) {

		this.history.execute( cmd, optionalName );

	},

	undo: function () {

		this.history.undo();

	},

	redo: function () {

		this.history.redo();

	},

	utils: {

		save: save,
		saveArrayBuffer: saveArrayBuffer,
		saveString: saveString,
		formatNumber: formatNumber

	}

};

const link = document.createElement( 'a' );

function save( blob, filename ) {

	if ( link.href ) {

		URL.revokeObjectURL( link.href );

	}

	link.href = URL.createObjectURL( blob );
	link.download = filename || 'data.json';
	link.dispatchEvent( new MouseEvent( 'click' ) );

}

function saveArrayBuffer( buffer, filename ) {

	save( new Blob( [ buffer ], { type: 'application/octet-stream' } ), filename );

}

function saveString( text, filename ) {

	save( new Blob( [ text ], { type: 'text/plain' } ), filename );

}

function formatNumber( number ) {

	return new Intl.NumberFormat( 'en-us', { useGrouping: true } ).format( number );

}

export { Editor };

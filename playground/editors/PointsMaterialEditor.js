import { ColorInput, ToggleInput, SliderInput, LabelElement } from 'flow';
import { MaterialEditor } from './MaterialEditor.js';
import { PointsNodeMaterial } from 'three/webgpu';
import * as THREE from 'three';
import { setInputAestheticsFromType } from '../DataTypeLib.js';

export class PointsMaterialEditor extends MaterialEditor {

	constructor() {

		const material = new PointsNodeMaterial();

		super( 'Points Material', material );

		const color = setInputAestheticsFromType( new LabelElement( 'color' ), 'Color' );
		const opacity = setInputAestheticsFromType( new LabelElement( 'opacity' ), 'Number' );
		const size = setInputAestheticsFromType( new LabelElement( 'size' ), 'Number' );
		const position = setInputAestheticsFromType( new LabelElement( 'position' ), 'Vector3' );
		const sizeAttenuation = setInputAestheticsFromType( new LabelElement( 'Size Attenuation' ), 'Number' );

		color.add( new ColorInput( material.color.getHex() ).onChange( ( input ) => {

			material.color.setHex( input.getValue() );

		} ) );

		opacity.add( new SliderInput( material.opacity, 0, 1 ).onChange( ( input ) => {

			material.opacity = input.getValue();

			this.updateTransparent();

		} ) );

sizeAttenuation.add( new ToggleInput( material.sizeAttenuation ).onClick( ( input ) => {

material.sizeAttenuation = input.getValue();
material.dispose();
this.update();

} ) );

		color.onConnect( () => this.update(), true );
		opacity.onConnect( () => this.update(), true );
		size.onConnect( () => this.update(), true );
		position.onConnect( () => this.update(), true );

		this.add( color )
			.add( opacity )
			.add( size )
			.add( position )
			.add( sizeAttenuation );

		this.color = color;
		this.opacity = opacity;
		this.size = size;
		this.position = position;
		this.sizeAttenuation = sizeAttenuation;

		this.update();

	}

	update() {

		const { material, color, opacity, size, position } = this;

		color.setEnabledInputs( ! color.getLinkedObject() );
		opacity.setEnabledInputs( ! opacity.getLinkedObject() );

		material.colorNode = color.getLinkedObject();
		material.opacityNode = opacity.getLinkedObject() || null;

		material.sizeNode = size.getLinkedObject() || null;
		material.positionNode = position.getLinkedObject() || null;

material.dispose();

this.updateTransparent();

// Mirror the customProgramCacheKey usage from examples/webgl_materials_modified.html,
// but populate it with the PointsNodeMaterial inputs used in the WebGPU instance points
// example so shader programs only rebuild when wiring or key toggles (vertex colors,
// size attenuation) change.
material.customProgramCacheKey = () => {

const parts = [
material.colorNode ? material.colorNode.uuid : 'color:none',
material.opacityNode ? material.opacityNode.uuid : 'opacity:none',
material.sizeNode ? material.sizeNode.uuid : 'size:none',
material.positionNode ? material.positionNode.uuid : 'position:none',
material.vertexColors ? 'vertexColors:on' : 'vertexColors:off',
material.sizeAttenuation ? 'sizeAttenuation:on' : 'sizeAttenuation:off'
];

return parts.join( '|' );

};

material.needsUpdate = true;

	}
	updateTransparent() {

		const { material, opacity } = this;

		material.transparent = opacity.getLinkedObject() || material.opacity < 1 ? true : false;

		opacity.setIcon( material.transparent ? 'ti ti-layers-intersect' : 'ti ti-layers-subtract' );

	}

}

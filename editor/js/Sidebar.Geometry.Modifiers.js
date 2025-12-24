import { UIDiv, UIButton, UIRow } from './libs/ui.js';

import { Box2, ExtrudeGeometry, ShapeGeometry, Vector2 } from 'three';
import { computeMikkTSpaceTangents, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';

function SidebarGeometryModifiers( editor, object ) {

	const strings = editor.strings;

	const signals = editor.signals;

	const container = new UIDiv().setMarginLeft( '120px' );

	const geometry = object.geometry;

	function ensureAxisFrame() {

		if ( editor.ensureAxisFrame( object ) === undefined ) {

			console.warn( 'AxisFrame missing: geometry operation skipped.' );
			return false;

		}

		return true;

	}

	// Compute Vertex Normals

	const computeVertexNormalsButton = new UIButton( strings.getKey( 'sidebar/geometry/compute_vertex_normals' ) );
	computeVertexNormalsButton.onClick( function () {

		if ( ensureAxisFrame() === false ) return;

		geometry.computeVertexNormals();

		signals.geometryChanged.dispatch( object );

	} );

	const computeVertexNormalsRow = new UIRow();
	computeVertexNormalsRow.add( computeVertexNormalsButton );
	container.add( computeVertexNormalsRow );

	// Compute Vertex Tangents

	if ( geometry.hasAttribute( 'position' ) && geometry.hasAttribute( 'normal' ) && geometry.hasAttribute( 'uv' ) ) {

		const computeVertexTangentsButton = new UIButton( strings.getKey( 'sidebar/geometry/compute_vertex_tangents' ) );
		computeVertexTangentsButton.onClick( async function () {

			if ( ensureAxisFrame() === false ) return;

			await MikkTSpace.ready;

			computeMikkTSpaceTangents( geometry, MikkTSpace );

			signals.geometryChanged.dispatch( object );

		} );

		const computeVertexTangentsRow = new UIRow();
		computeVertexTangentsRow.add( computeVertexTangentsButton );
		container.add( computeVertexTangentsRow );

	}

	// Center Geometry

	const centerButton = new UIButton( strings.getKey( 'sidebar/geometry/center' ) );
	centerButton.onClick( function () {

		if ( ensureAxisFrame() === false ) return;

		geometry.center();

		signals.geometryChanged.dispatch( object );

	} );

	const centerRow = new UIRow();
	centerRow.add( centerButton );
	container.add( centerRow );

	// Compute Bounding Box (mirrors examples/webgl_geometry_text_shapes.html usage)

	const computeBoundingBoxButton = new UIButton( strings.getKey( 'sidebar/geometry/compute_bounding_box' ) );
	computeBoundingBoxButton.onClick( function () {

		if ( ensureAxisFrame() === false ) return;

		geometry.computeBoundingBox();

		signals.geometryChanged.dispatch( object );

	} );

	const computeBoundingBoxRow = new UIRow();
	computeBoundingBoxRow.add( computeBoundingBoxButton );
	container.add( computeBoundingBoxRow );

	// Compute Bounding Sphere (mirrors examples/webgl_buffergeometry_drawrange.html usage)

	const computeBoundingSphereButton = new UIButton( strings.getKey( 'sidebar/geometry/compute_bounding_sphere' ) );
	computeBoundingSphereButton.onClick( function () {

		if ( ensureAxisFrame() === false ) return;

		geometry.computeBoundingSphere();

		signals.geometryChanged.dispatch( object );

	} );

	const computeBoundingSphereRow = new UIRow();
	computeBoundingSphereRow.add( computeBoundingSphereButton );
	container.add( computeBoundingSphereRow );

        // Merge Vertices (based on BufferGeometryUtils.mergeVertices usage in examples/webgl_custom_attributes_points3.html)

	const mergeVerticesButton = new UIButton( strings.getKey( 'sidebar/geometry/merge_vertices' ) );
	mergeVerticesButton.onClick( function () {

		if ( ensureAxisFrame() === false ) return;

		const mergedGeometry = mergeVertices( geometry );

		if ( mergedGeometry !== geometry ) {

			geometry.dispose();
			object.geometry = mergedGeometry;

		}

		signals.geometryChanged.dispatch( object );

	} );

	const mergeVerticesRow = new UIRow();
        mergeVerticesRow.add( mergeVerticesButton );
        container.add( mergeVerticesRow );

        // Shape inset + extrude (shape rebuild pattern mirrors examples/webgl_geometry_shapes.html)

        if ( geometry.parameters !== undefined && geometry.parameters.shapes !== undefined ) {

                const insetButton = new UIButton( strings.getKey( 'sidebar/geometry/inset_shape' ) );
                insetButton.onClick( function () {

                        if ( ensureAxisFrame() === false ) return;

                        const shapeList = Array.isArray( geometry.parameters.shapes ) ? geometry.parameters.shapes : [ geometry.parameters.shapes ];
                        const insetShapes = shapeList.map( ( shape ) => {

                                const cloned = shape.clone();
                                const points = cloned.getPoints();

                                if ( points.length === 0 ) return cloned;

                                const box = new Box2().setFromPoints( points );
                                const center = box.getCenter( new Vector2() );

                                cloned.translate( - center.x, - center.y );
                                cloned.scale( 0.9, 0.9 );
                                cloned.translate( center.x, center.y );

                                return cloned;

                        } );

                        const insetGeometry = new ShapeGeometry( insetShapes, geometry.parameters.curveSegments );

                        geometry.dispose();
                        object.geometry = insetGeometry;

                        signals.geometryChanged.dispatch( object );

                } );

                const insetRow = new UIRow();
                insetRow.add( insetButton );
                container.add( insetRow );

                // Extrude settings mirror the beveled example block in examples/webgl_geometry_extrude_shapes.html
                const extrudeButton = new UIButton( strings.getKey( 'sidebar/geometry/extrude_shape' ) );
                extrudeButton.onClick( function () {

                        if ( ensureAxisFrame() === false ) return;

                        const shapeList = Array.isArray( geometry.parameters.shapes ) ? geometry.parameters.shapes : [ geometry.parameters.shapes ];

                        const extrudeSettings = {
                                depth: 20,
                                steps: 1,
                                bevelEnabled: true,
                                bevelThickness: 2,
                                bevelSize: 4,
                                bevelSegments: 1,
                                curveSegments: geometry.parameters.curveSegments || 12
                        };

                        const extrudeGeometry = new ExtrudeGeometry( shapeList, extrudeSettings );

                        geometry.dispose();
                        object.geometry = extrudeGeometry;

                        signals.geometryChanged.dispatch( object );

                } );

                const extrudeRow = new UIRow();
                extrudeRow.add( extrudeButton );
                container.add( extrudeRow );

        }

	//

	return container;

}

export { SidebarGeometryModifiers };

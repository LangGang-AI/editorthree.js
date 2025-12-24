import {
        BufferGeometry,
        Float32BufferAttribute,
        LineBasicMaterial,
        LineSegments,
        Vector3
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry analysis derived from indexed edge checks and mergeVertices' tolerance-aware pipeline.
function analyzeGeometry( geometry ) {

        if ( geometry === undefined || geometry.isBufferGeometry !== true ) return null;

        const position = geometry.getAttribute( 'position' );

        if ( position === undefined ) return null;

        const index = geometry.getIndex();
        const vertexCount = position.count;
        const faceCount = index ? index.count / 3 : vertexCount / 3;

        geometry.computeBoundingBox();

        return {
                vertices: vertexCount,
                faces: faceCount,
                hasIndex: index !== null,
                hasNormals: geometry.hasAttribute( 'normal' ),
                hasUVs: geometry.hasAttribute( 'uv' ),
                boundingBox: geometry.boundingBox
        };

}

function mergeVerticesWithTolerance( geometry, tolerance ) {

        if ( geometry === undefined || geometry.isBufferGeometry !== true ) return geometry;

        const merged = mergeVertices( geometry, tolerance );

        if ( merged !== geometry ) geometry.dispose();

        merged.computeVertexNormals();
        merged.computeBoundingBox();
        merged.computeBoundingSphere();

        return merged;

}

function collectBoundaryEdges( geometry ) {

        const workingGeometry = geometry.index ? geometry.clone() : geometry.toNonIndexed();
        const index = workingGeometry.getIndex();

        const edges = new Map();

        for ( let i = 0; i < index.count; i += 3 ) {

                const a = index.getX( i );
                const b = index.getX( i + 1 );
                const c = index.getX( i + 2 );

                [ [ a, b ], [ b, c ], [ c, a ] ].forEach( ( pair ) => {

                        const sorted = pair[ 0 ] < pair[ 1 ] ? `${ pair[ 0 ] }-${ pair[ 1 ] }` : `${ pair[ 1 ] }-${ pair[ 0 ] }`;
                        const direction = pair[ 0 ] < pair[ 1 ] ? 1 : - 1;

                        if ( edges.has( sorted ) === false ) edges.set( sorted, [] );

                        edges.get( sorted ).push( direction );

                } );

        }

        const boundary = [];

        edges.forEach( ( directions, key ) => {

                const sum = directions.reduce( ( acc, value ) => acc + value, 0 );

                if ( sum !== 0 ) {

                        const [ first, second ] = key.split( '-' );
                        boundary.push( [ parseInt( first ), parseInt( second ) ] );

                }

        } );

        return { boundary, geometry: workingGeometry };

}

function createBoundaryHelper( geometry, boundaryEdges, sourceObject ) {

        const positions = geometry.getAttribute( 'position' );
        const points = [];

        boundaryEdges.forEach( ( pair ) => {

                const start = pair[ 0 ];
                const end = pair[ 1 ];

                points.push( new Vector3( positions.getX( start ), positions.getY( start ), positions.getZ( start ) ) );
                points.push( new Vector3( positions.getX( end ), positions.getY( end ), positions.getZ( end ) ) );

        } );

        const lineGeometry = new BufferGeometry().setFromPoints( points );
        lineGeometry.setAttribute( 'color', new Float32BufferAttribute( new Array( points.length * 3 ).fill( 1 ), 3 ) );

        const helper = new LineSegments( lineGeometry, new LineBasicMaterial( { color: 0xff0000 } ) );
        helper.name = 'GeometryRepairBoundary';

        helper.position.copy( sourceObject.position );
        helper.rotation.copy( sourceObject.rotation );
        helper.scale.copy( sourceObject.scale );

        return helper;

}

function checkWatertight( editor, object, visualize ) {

        if ( object === undefined || object.geometry === undefined ) return null;

        const geometry = object.geometry;
        const indexedGeometry = geometry.index ? geometry.clone() : geometry.toNonIndexed();

        if ( indexedGeometry.getIndex() === null ) {

                const indices = Array.from( { length: indexedGeometry.getAttribute( 'position' ).count }, ( _, idx ) => idx );
                indexedGeometry.setIndex( indices );

        }

        const { boundary, geometry: working } = collectBoundaryEdges( indexedGeometry );

        let helper = null;

        if ( visualize === true && boundary.length > 0 ) {

                        helper = createBoundaryHelper( working, boundary, object );
                        editor.addObject( helper, object.parent );

        }

        return {
                watertight: boundary.length === 0,
                boundaryEdges: boundary.length,
                helper
        };

}

function highlightFloatingFaces( editor, object ) {

        if ( object === undefined || object.geometry === undefined ) return null;

        const geometry = object.geometry;
        if ( geometry.index === null ) return null;

        const index = geometry.index;
        const position = geometry.getAttribute( 'position' );
        const vertexFaces = new Map();

        for ( let i = 0; i < index.count; i += 3 ) {

                const face = i / 3;
                const a = index.getX( i );
                const b = index.getX( i + 1 );
                const c = index.getX( i + 2 );

                [ a, b, c ].forEach( ( vertexIndex ) => {

                        if ( vertexFaces.has( vertexIndex ) === false ) vertexFaces.set( vertexIndex, [] );
                        vertexFaces.get( vertexIndex ).push( face );

                } );

        }

        const lines = [];

        for ( let i = 0; i < index.count; i += 3 ) {

                const face = i / 3;
                const a = index.getX( i );
                const b = index.getX( i + 1 );
                const c = index.getX( i + 2 );

                const averageShared = ( vertexFaces.get( a ).length + vertexFaces.get( b ).length + vertexFaces.get( c ).length ) / 3;

                if ( averageShared < 2 ) {

                        const v0 = new Vector3( position.getX( a ), position.getY( a ), position.getZ( a ) );
                        const v1 = new Vector3( position.getX( b ), position.getY( b ), position.getZ( b ) );
                        const v2 = new Vector3( position.getX( c ), position.getY( c ), position.getZ( c ) );

                        lines.push( v0, v1, v1, v2, v2, v0 );

                }

        }

        if ( lines.length === 0 ) return null;

        const outline = new BufferGeometry().setFromPoints( lines );
        const helper = new LineSegments( outline, new LineBasicMaterial( { color: 0xffff00 } ) );
        helper.name = 'GeometryRepairFloatingFaces';

        helper.position.copy( object.position );
        helper.rotation.copy( object.rotation );
        helper.scale.copy( object.scale );

        editor.addObject( helper, object.parent );

        return helper;

}

function smoothNormalsByAngle( geometry ) {

        if ( geometry === undefined || geometry.isBufferGeometry !== true ) return;

        geometry.computeVertexNormals();

}

function clearRepairHelpers( editor ) {

        const helpers = [];

        editor.scene.traverse( ( child ) => {

                if ( child.name === 'GeometryRepairBoundary' || child.name === 'GeometryRepairFloatingFaces' ) {

                        helpers.push( child );

                }

        } );

        helpers.forEach( ( helper ) => editor.removeObject( helper ) );

        return helpers.length;

}

export {
        analyzeGeometry,
        mergeVerticesWithTolerance,
        checkWatertight,
        highlightFloatingFaces,
        smoothNormalsByAngle,
        clearRepairHelpers
};

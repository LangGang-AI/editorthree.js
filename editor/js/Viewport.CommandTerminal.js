import { UIPanel, UIText, UIInput, UITextArea, UIButton } from './libs/ui.js';

function ViewportCommandTerminal( editor ) {

        const signals = editor.signals;
        const strings = editor.strings;

        const container = new UIPanel();
        // Overlay layout mirrors the floating panel pattern used by Viewport.Info.js.
        container.setId( 'commandTerminal' );
        container.setPosition( 'absolute' );
        container.setLeft( '10px' );
        container.setBottom( '20px' );
        container.setWidth( '320px' );
        container.setPadding( '8px' );
        container.setBackgroundColor( 'rgba(0,0,0,0.85)' );
        container.setColor( '#ffffff' );
        container.setDisplay( editor.commandTerminalVisible ? '' : 'none' );
        container.setStyle( 'borderRadius', [ '4px' ] );
        container.setStyle( 'boxShadow', [ '0 0 0 1px rgba(255,255,255,0.08)' ] );

        const header = new UIPanel();
        header.setDisplay( 'flex' );
        header.setAlignItems( 'center' );
        header.setMarginBottom( '6px' );

        const title = new UIText( strings.getKey( 'viewport/command/title' ) );
        title.setFontWeight( 'bold' );
        title.setColor( '#ffffff' );
        title.setWidth( '100%' );

        const closeButton = new UIButton( '×' );
        closeButton.setMarginLeft( '6px' );
        closeButton.setWidth( '28px' );
        closeButton.setHeight( '28px' );
        closeButton.setBackgroundColor( 'rgba(255,255,255,0.1)' );
        closeButton.setColor( '#ffffff' );
        closeButton.dom.addEventListener( 'click', function () {

                editor.toggleCommandTerminal( false );

        } );

        header.add( title );
        header.add( closeButton );
        container.add( header );

        const log = new UITextArea();
        log.setValue( strings.getKey( 'viewport/command/help' ) );
        log.setWidth( '100%' );
        log.setHeight( '120px' );
        log.setMarginBottom( '6px' );
        log.setFontSize( '12px' );
        log.dom.readOnly = true;

        container.add( log );

        const inputRow = new UIPanel();
        inputRow.setDisplay( 'flex' );
        inputRow.setAlignItems( 'center' );
        inputRow.setStyle( 'gap', [ '6px' ] );

        const prompt = new UIText( strings.getKey( 'viewport/command/prompt' ) );
        prompt.setWidth( '48px' );
        prompt.setTextTransform( 'uppercase' );

        const input = new UIInput();
        input.setWidth( '100%' );
        input.setHeight( '28px' );
        input.setColor( '#ffffff' );
        input.setBackgroundColor( 'rgba(255,255,255,0.06)' );
        input.dom.placeholder = strings.getKey( 'viewport/command/placeholder' );

        let historyIndex = null;
        const entries = [];

        function refreshLog( entry ) {

                if ( entry !== null ) {

                        entries.push( entry );

                        if ( entries.length > 50 ) {

                                entries.shift();

                        }

                }

                const lines = entries.map( ( item ) => {

                        const prefix = ( item.status === 'error' ) ? '!' : '>';
                        return `${prefix} ${item.input}\n${item.message}`;

                } );

                log.setValue( lines.join( '\n' ) || strings.getKey( 'viewport/command/help' ) );
                log.dom.scrollTop = log.dom.scrollHeight;

        }

        function submitCommand() {

                const value = input.getValue();
                const result = editor.runCommandTerminal( value );

                if ( result !== null ) {

                        refreshLog( result );
                        input.setValue( '' );
                        historyIndex = null;

                }

        }

        function applyHistory( direction ) {

                if ( editor.commandTerminalHistory.length === 0 ) return;

                if ( historyIndex === null ) {

                        historyIndex = editor.commandTerminalHistory.length - 1;

                } else {

                        historyIndex = Math.min( editor.commandTerminalHistory.length - 1, Math.max( 0, historyIndex + direction ) );

                }

                input.setValue( editor.commandTerminalHistory[ historyIndex ] );
                input.dom.setSelectionRange( input.dom.value.length, input.dom.value.length );

        }

        input.dom.addEventListener( 'keydown', function ( event ) {

                if ( event.key === 'Enter' ) {

                        event.preventDefault();
                        submitCommand();
                        return;

                }

                if ( event.key === 'ArrowUp' ) {

                        event.preventDefault();
                        applyHistory( -1 );
                        return;

                }

                if ( event.key === 'ArrowDown' ) {

                        event.preventDefault();
                        applyHistory( 1 );

                }

        } );

        inputRow.add( prompt );
        inputRow.add( input );
        container.add( inputRow );

        signals.commandTerminalOutput.add( function ( entry ) {

                refreshLog( entry );

        } );

        signals.commandTerminalVisibilityChanged.add( function ( visible ) {

                container.setDisplay( visible ? '' : 'none' );

                if ( visible ) {

                                input.dom.focus();

                }

        } );

        signals.editorCleared.add( function () {

                entries.length = 0;
                historyIndex = null;
                refreshLog( null );

        } );

        return container;

}

export { ViewportCommandTerminal };

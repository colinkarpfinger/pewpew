import { UIPanel, UIRow, UIHorizontalRule } from './libs/ui.js';

function MenubarGame( editor ) {

	let currentLevelName = null;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( 'Game' );
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// Fetch and populate level list when menu is opened

	let levelListDirty = true;
	const levelItemsContainer = document.createElement( 'div' );
	options.dom.appendChild( levelItemsContainer );

	container.onMouseOver( function () {

		if ( ! levelListDirty ) return;
		levelListDirty = false;

		fetch( '/api/levels' )
			.then( r => r.json() )
			.then( files => {

				levelItemsContainer.innerHTML = '';

				for ( const filename of files ) {

					const option = new UIRow().setTextContent( filename ).setClass( 'option' );

					if ( filename.endsWith( '.glb' ) ) {

						option.dom.style.opacity = '0.5';
						option.onClick( function () {

							alert( 'GLB files cannot be edited here. Use Blender to edit this level.' );

						} );

					} else {

						option.onClick( function () {

							loadLevel( filename );

						} );

					}

					levelItemsContainer.appendChild( option.dom );

				}

			} );

	} );

	// Mark list dirty when mouse leaves so it refreshes next open

	container.onMouseOut( function ( event ) {

		if ( ! container.dom.contains( event.relatedTarget ) ) {

			levelListDirty = true;

		}

	} );

	// Separator

	options.add( new UIHorizontalRule() );

	// Save Level

	const saveLevelOption = new UIRow()
		.addClass( 'option' )
		.setTextContent( 'Save Level' );

	saveLevelOption.dom.style.opacity = '0.5';
	saveLevelOption.dom.style.pointerEvents = 'none';

	saveLevelOption.onClick( function () {

		if ( currentLevelName ) {

			saveLevel( currentLevelName );

		}

	} );
	options.add( saveLevelOption );

	// Save Level As

	const saveLevelAsOption = new UIRow()
		.addClass( 'option' )
		.setTextContent( 'Save Level As...' );
	saveLevelAsOption.onClick( function () {

		const name = prompt( 'Level filename:', currentLevelName || 'level.json' );
		if ( ! name ) return;

		const filename = name.endsWith( '.json' ) ? name : name + '.json';
		currentLevelName = filename;
		saveLevel( filename );

		saveLevelOption.dom.style.opacity = '1';
		saveLevelOption.dom.style.pointerEvents = 'auto';

	} );
	options.add( saveLevelAsOption );

	// Load function
	// Level files are Three.js scene JSON (metadata.type === 'Object'),
	// not full editor project JSON.

	async function loadLevel( filename ) {

		try {

			const res = await fetch( '/api/levels/' + encodeURIComponent( filename ) );
			const json = await res.json();

			const loader = new THREE.ObjectLoader();
			const scene = await loader.parseAsync( json );

			editor.clear();
			editor.setScene( scene );

			currentLevelName = filename;

			saveLevelOption.dom.style.opacity = '1';
			saveLevelOption.dom.style.pointerEvents = 'auto';

		} catch ( e ) {

			console.error( 'Failed to load level:', e );
			alert( 'Failed to load level: ' + e.message );

		}

	}

	// Save function
	// Saves the scene as Three.js Object JSON (same format the game's loadLevel expects).

	async function saveLevel( filename ) {

		try {

			const json = editor.scene.toJSON();
			await fetch( '/api/levels/' + encodeURIComponent( filename ), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( json ),
			} );

		} catch ( e ) {

			console.error( 'Failed to save level:', e );

		}

	}

	return container;

}

export { MenubarGame };

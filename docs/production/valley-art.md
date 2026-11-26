# Coastal valley art direction

The 0.1.24 sprites were made for Tervain using the built-in OpenAI image generation tool. The runtime paintings and sequences are in [the scenery atlas](../../public/valley/scenery.png) and [its frame index](../../public/valley/scenery.json). The [inventory icons](../../public/valley/icons) use the same cutouts as their world objects.

Each source was requested on transparent alpha, viewed from above at about 30 degrees with daylight from the upper left. The final pixel edit removes matte fringe, reduces each painting to a small palette and places its trunk, posts, stone rim, or feet at the world anchor. The bell moves on its hanger. The fisher's net moves between two hand positions. The seated resident breathes and shifts her hands while the stool stays planted. The tripod flame changes below the pot. Wind moves the crowns around fixed roots.

## The Bell Road

The portraits are an original five-expression commission for the wanderer, Joss, Mara, Edda, Darin and Harrow, commissioned through OpenAI image generation for this release. Each face has an 80-pixel cell in the [expression sheet](../../public/valley/portraits.png). The renderer selects a row by speaker and a column from the conversation and reply intent.

The world palette and matte treatment are shared by the figure and scenery packers. Doorway height follows the standing wanderer. Each home has a trade-specific plan and fixtures. The score, field accents and environment loops were composed and synthesized for Tervain. The [score inventory](../engineering/bell-road-audio.json) records each track and the generator used for it.

## Generation prompts

The seven sheets used these production briefs.

1. **Shore pines.** A slender young Scots pine, a mature pine with one readable bare branch and a windswept shoreline pine. Isolate the three trees with space between crowns. Use deep forest-green shadow, muted sage tips and warm fissured bark. Roots enter the earth at a single point. Design for a 40 by 52 pixel sprite.
2. **Village fixtures.** Six separate objects in a three-column, two-row sheet. A grey fieldstone well with cedar shingles, spindle, rope and bucket. A bronze bell on a timber yoke with a dark clapper and hand rope. An amber-glass lantern on a hooked roadside post. A timber direction sign. A two-wheeled handcart with tied linen sacks, shafts and blanket. A rain-capped noticeboard with pinned ivory sheets. Weathered materials and readable contact points, with clear air under the objects.
3. **The hearth and its surrounds.** A grey-haired coastal resident in a lichen-green cloak seated on a low stool, warming her hands toward an unseen fire on her left. A separate iron cooking pot hung from a tripod over a single low fire. Living heath with a few muted lavender tips. Loose layered slate with small fragments. Readable at 20 to 34 pixels tall.
4. **Supplies.** A butchered cut of red venison loin with a strip of fat. A bent iron strap with a square nail hole and a broken rivet. One russet windfall apple with a curling leaf. Two edible chestnut mushrooms with pale gills. Orthographic inventory cutouts designed for 20 to 32 pixels.
5. **The inland wood.** Mature and young silver firs with irregular layered boughs. A single-trunk birch and a forked summer birch with light, airy foliage. A broad sessile oak and a smaller windswept oak. Six distinct silhouettes, visible bark and openings in the crowns, all feet fully in frame. Muted moss, fern and ochre in the light.
6. **The working residents.** A seated net mender in a russet cap with a net across his knees. A second view of the same man on the same stool raising his right hand to pull a strand. A standing lighthouse keeper with grizzled hair, slate-blue coat and worn boots. Warm wool and linen, visible hands and grounded feet.
7. **The trail.** A broken grey-stone shrine arch with two wall returns and sparse ivy. A tapered stone signal tower with a single roofed iron beacon cage. A short weatherworn slate waymarker incised with a chevron. A few oxeye daisies on fine sage stems. Each subject ends at its own material edge so that the game's terrain and daylight show through.

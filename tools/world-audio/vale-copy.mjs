/** Build the reader's recording script from the same English copy that the playable edition displays. */
import fs from 'node:fs';
import { parseSync } from 'rolldown/utils';

const read = (file) => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const data = (file) => JSON.parse(read('data/game/' + file + '.json'));
const script = new Map();
const numeric = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const key = (text) =>
  text
    .toLowerCase()
    .normalize('NFKC')
    .replaceAll('’', "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();
function record(text, delivery = text) {
  const id = key(text);
  if (!id || script.has(id)) return;
  const line = delivery
    .trim()
    .replace(/…/g, '.')
    .replace(/[·/]/g, ', ')
    .replace(/[\s.,;:–—-]+$/, '');
  if (line) script.set(id, /[?!]$/.test(line) ? line : line + '.');
}
const extra = [
  'Read aloud',
  'Stop reading',
  'Read this page',
  'Read surroundings',
  'Spoken audio',
  'Full narration',
  'Characters only',
  'Off',
  'Voice volume',
  'Music volume',
  'Effects volume',
  'Voiceover',
  'Voiceover and reading',
  'Read menus and nearby interactions',
  'Read this page or your surroundings aloud',
  'Voiceover settings',
  'Master volume',
  'Volume',
  'Sound',
  'Voice',
  'Music',
  'Effects',
  'East',
  'West',
  'North',
  'South',
  'interact',
  'attack',
  'guard',
  'jump',
  'inventory',
  'journal',
  'map',
  'Space',
  'Shift',
  'Escape',
  'Enter',
  'Control',
  'Alt',
  'Tab',
  'Backspace',
  'Arrow up',
  'Arrow down',
  'Arrow left',
  'Arrow right',
  'hundred',
  'thousand',
  'million',
  'billion',
  'minus',
  'plus',
  'percent',
  'point',
  'times',
  'of',
  'oh',
  'and',
  'version',
  'revision',
  'by',
  'to',
  'or',
  'at',
  'Grey Strand',
  'Ground floor',
  'carrying',
  'stored',
  'journey',
  'empty',
  'gate condition',
  'upstairs',
  'downstairs',
  'outside',
  'Speak with',
  'Talk to',
  'Examine',
  'Enter',
  'Leave',
  'Up to',
  'Down to',
  'Gather',
  'Skin',
  'Pet the',
  'day',
  'Health',
  'Stamina',
  'Belt slot',
  'has nothing more to say',
  'by the shutter',
  'struck you',
  'defeated',
  'Room',
  'Auto',
  'Quick',
  'Return',
  'Using',
  'selected',
  'The water of Bellwether Vale',
  'Arrows',
  'Mushrooms',
  'raw meat',
  'Meal',
  'on',
  'off',
  'available',
  'locked',
  'Grey Strand arrival',
  'No nearby interaction',
  'Read the current page or surroundings',
  'Press V to read aloud',
  'Stand up',
  'Read aloud settings',
  'carrying',
  'set aside',
  'in storage',
  'Use supplies',
  'No nearby interaction',
  'left bracket',
  'right bracket',
  'backslash',
  'slash',
  'semicolon',
  'quote',
  'backquote',
  'comma',
  'period',
  'equal',
  'numpad',
  'digit',
  'key',
  'function',
];
for (const value of extra) record(value);
for (let i = 0; i < 100; i++)
  record(String(i), i < 20 ? numeric[i] : tens[Math.floor(i / 10)] + (i % 10 ? ' ' + numeric[i % 10] : ''));
for (let i = 1; i <= 24; i++) record('F' + i, 'F ' + script.get(String(i)).replace(/\.$/, ''));
for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  record(letter, letter === 'A' ? 'Ay' : letter === 'I' ? 'Eye' : letter);
for (const [label, delivery] of Object.entries({
  'W A S D / arrows': 'W, A, S, D or arrow keys',
  'I / J / M': 'I, J or M',
  '1–0': 'One through zero',
  'F5 / F9': 'F five or F nine',
  'Controller X / RT': 'Controller X or right trigger',
  'Shift / Q / X': 'Shift, Q or X',
  'Gold marks passages. ↑ upstairs · ↓ downstairs · ◆ outside':
    'Gold marks passages. Up arrow, upstairs. Down arrow, downstairs. Diamond, outside.',
  1: 'one',
})) {
  script.delete(key(label));
  record(label, delivery);
}
for (const [id, original] of Object.entries(data('strings.en').strings)) {
  if (
    ![
      'journal',
      'toast',
      'item',
      'npc',
      'place',
      'inspect',
      'evidence',
      'board',
      'prompt',
      'animal',
      'action',
      'skill',
      'pickup',
      'req',
      'narr',
      'sluice',
      'map',
      'hud',
      'inv',
      'hint',
      'controls',
      'set',
      'menu',
      'hunting',
      'detail',
      'observe',
      'dlg',
      'arrival',
      'game',
    ].includes(id.split('.')[0])
  )
    continue;
  for (const segment of original.replace(/\{[^}]*:([^|}]+)\|([^}]+)\}/g, '{$1}{$2}').split(/\{[^}]+\}/))
    record(segment);
}
const spokenFiles = [
  'interface',
  'client',
  'households',
  'roomTargets',
  'roomPlans',
  'simulation',
  'fieldcraft',
  'propCatalogue',
];
for (const name of spokenFiles) {
  const source = parseSync(name + '.ts', read('src/isometric/' + name + '.ts')).program;
  function visit(node) {
    if (name === 'propCatalogue' && node.type === 'CallExpression' && node.callee.name === 'kind') {
      const label = node.arguments[0]?.value,
        mass = node.arguments[3]?.value;
      if (typeof label === 'string') record((mass > 30 ? 'Drag the ' : 'Lift the ') + label.toLowerCase());
    }
    if (name === 'households' && node.type === 'CallExpression' && node.callee.name === 'home') {
      const [house, shop, loft, cellar, , , , book, passage] = node.arguments.map((v) => v.value);
      for (const content of [house, shop, loft, cellar, book, passage]) record(content);
      for (const text of [
        'Enter ' + house,
        'Leave ' + house,
        'Up to ' + loft,
        'Down to ' + cellar,
        'Enter ' + shop,
        'Enter ' + loft,
        'Enter ' + cellar,
      ])
        record(text);
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const text = node.value.trim();
      if (
        text.length <= 380 &&
        !/[<>={}\[\]\\/]/.test(text) &&
        (/^[A-Z][a-zA-Z’' .,!?…·()↑↓◆×+–—:\d-]*$/.test(text) || /^[a-z’'-]+(?: [a-z’'-]+)+[.!?]?$/.test(text))
      )
        record(text);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child))
        child.forEach((item) => {
          if (item?.type) visit(item);
        });
      else if (child?.type) visit(child);
    }
  }
  visit(source);
}
const residents = data('residents').npcs ?? data('residents').residents;
for (const person of residents) {
  record(person.name);
  record('Speak with ' + person.name);
  record(person.name + ' has nothing more to say.');
}
for (const id of [
  'cat',
  'dog',
  'deer',
  'boar',
  'bear',
  'tiger',
  'lion',
  'wolf',
  'saddled deer',
  'bandit',
  'thornback',
])
  record(id);
for (const id of ['healing_herb', 'shore_apple', 'field_mushroom', 'iron_scrap'])
  record('Gather ' + data('strings.en').strings['item.' + id]);
for (const id of [
  'Room',
  'Settings',
  'Dialogue',
  'Books',
  'Animals',
  'Sitting',
  'Petting',
  'Gathering',
  'Resting',
  'Cooking',
  'Working',
  'Reading',
  'Skinning',
  'Drawing',
  'Release to shoot',
])
  record(id);
for (const phrase of [
  'Enter Entry hall',
  'Enter Keeping room',
  'Enter Strongroom',
  'Enter Writing room',
  'Enter Bedchamber',
  'Enter Dry stores',
  'Up to Ground floor',
  'Down to Ground floor',
  'Take',
  'Store',
  'Withdraw',
  'carrying',
  'in the chest',
  'Coffer',
  'Lowered',
  'Opened',
  'Draw',
  'Release',
  'Speak',
  'Status',
  'World',
  'Home',
  'Settings apply for this session.',
  'gathering',
  'Pet the cat',
  'Pet the dog',
  'Ask about the vale',
  'Back to conversation',
  'Close the book',
  'Read aloud',
  'Shift left',
  'Shift right',
  'Arrow left',
  'Arrow right',
  'Arrow up',
  'Arrow down',
  'Control left',
  'Control right',
  'right mouse',
  'click',
  'hold',
  'version',
  'Grey Strand',
  'Gate condition',
  'jammed',
  'stabilized',
  'unbraced',
  'unstable',
  'braced',
  'open',
  'broken',
  'sealed',
  'The shutter is fastened from inside.',
])
  record(phrase);
for (const id of [
  'spoken caption plate',
  'keyv',
  'true',
  'false',
  'npcs',
  'utf',
  'keya',
  'keyd',
  'keyw',
  'keys',
])
  script.delete(id);
// The narrator can join dynamically substituted nouns, quantities and bound keys without switching voices.
for (const phrase of [...script.keys()]) {
  for (const word of phrase.split(' ')) if (/^[a-z][a-z']{1,}$/.test(word) && !script.has(word)) record(word);
}
export const readerScript = Object.fromEntries(script);
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href)
  process.stdout.write(JSON.stringify(readerScript, null, 2) + '\n');

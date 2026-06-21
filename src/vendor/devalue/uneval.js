import {
	DevalueError,
	enumerable_symbols,
	escaped,
	get_type,
	is_plain_object,
	is_primitive,
	stringify_key,
	stringify_string,
	valid_array_indices
} from './utils.js';

const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
const unsafe_chars = /[<\b\f\n\r\t\0\u2028\u2029]/g;
const reserved =
	/^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;

/**
 * Turn a value into the JavaScript that creates an equivalent value
 * @param {any} value
 * @param {(value: any, uneval: (value: any) => string) => string | void} [replacer]
 */
export function uneval(value, replacer) {
	const counts = new Map();

	/** @type {string[]} */
	const keys = [];

	/** @type {Map<any, string | undefined>} */
	const custom = new Map();

	/** @param {any} thing */
	function walk(thing) {
		if (!is_primitive(thing)) {
			if (counts.has(thing)) {
				counts.set(thing, counts.get(thing) + 1);
				return;
			}

			counts.set(thing, 1);

			if (replacer) {
				let calledWalk = false;
				const str = replacer(thing, (value) => {
					calledWalk = true;
					walk(value);
					return '<placeholder>';
				});

				if (typeof str === 'string') {
					// If the replacer called walk, then we need to handle the possiblilty that inner values
					// are seen multiple times, and may need to be deduped with a name. In that case run the
					// replacer again during stringify.
					custom.set(thing, calledWalk ? undefined : str);
					return;
				}
			}

			if (typeof thing === 'function') {
				throw new DevalueError(`Cannot stringify a function`, keys, thing, value);
			}

			const type = get_type(thing);

			switch (type) {
				case 'Number':
				case 'BigInt':
				case 'String':
				case 'Boolean':
				case 'Date':
				case 'RegExp':
				case 'URL':
				case 'URLSearchParams':
					return;

				case 'Array':
					/** @type {any[]} */ (thing).forEach((value, i) => {
						keys.push(`[${i}]`);
						walk(value);
						keys.pop();
					});
					break;

				case 'Set':
					Array.from(thing).forEach(walk);
					break;

				case 'Map':
					for (const [key, value] of thing) {
						keys.push(`.get(${is_primitive(key) ? stringify_primitive(key) : '...'})`);
						walk(value);
						keys.pop();
					}
					break;

				case 'Int8Array':
				case 'Uint8Array':
				case 'Uint8ClampedArray':
				case 'Int16Array':
				case 'Uint16Array':
				case 'Float16Array':
				case 'Int32Array':
				case 'Uint32Array':
				case 'Float32Array':
				case 'Float64Array':
				case 'BigInt64Array':
				case 'BigUint64Array':
				case 'DataView':
					walk(thing.buffer);
					return;

				case 'ArrayBuffer':
					return;

				case 'Temporal.Duration':
				case 'Temporal.Instant':
				case 'Temporal.PlainDate':
				case 'Temporal.PlainTime':
				case 'Temporal.PlainDateTime':
				case 'Temporal.PlainMonthDay':
				case 'Temporal.PlainYearMonth':
				case 'Temporal.ZonedDateTime':
					return;

				default:
					if (!is_plain_object(thing)) {
						throw new DevalueError(`Cannot stringify arbitrary non-POJOs`, keys, thing, value);
					}

					if (enumerable_symbols(thing).length > 0) {
						throw new DevalueError(`Cannot stringify POJOs with symbolic keys`, keys, thing, value);
					}

					for (const key of Object.keys(thing)) {
						if (key === '__proto__') {
							throw new DevalueError(
								`Cannot stringify objects with __proto__ keys`,
								keys,
								thing,
								value
							);
						}

						keys.push(stringify_key(key));
						walk(thing[key]);
						keys.pop();
					}
			}
		} else if (typeof thing === 'symbol') {
			throw new DevalueError(`Cannot stringify a Symbol primitive`, keys, thing, value);
		}
	}

	walk(value);

	const names = new Map();

	Array.from(counts)
		.filter((entry) => entry[1] > 1)
		.sort((a, b) => b[1] - a[1])
		.forEach((entry, i) => {
			names.set(entry[0], get_name(i));
		});

	/**
	 * @param {any} thing
	 * @returns {string}
	 */
	function stringify(thing) {
		if (names.has(thing)) {
			return names.get(thing);
		}

		if (is_primitive(thing)) {
			return stringify_primitive(thing);
		}

		if (custom.has(thing)) {
			const str = custom.get(thing);
			if (str !== undefined) {
				return str;
			}
			const finalStr = replacer(thing, (value) => stringify(value));
			if (typeof finalStr === 'string') {
				custom.set(thing, finalStr);
				return finalStr;
			}
			throw new TypeError(
				'Replacer must return a string when called on a value it previously returned a string for'
			);
		}

		const type = get_type(thing);

		switch (type) {
			case 'Number':
			case 'String':
			case 'Boolean':
			case 'BigInt':
				return `Object(${stringify(thing.valueOf())})`;

			case 'RegExp':
				const { source, flags } = thing;
				return flags
					? `new RegExp(${stringify_string(source)},"${flags}")`
					: `new RegExp(${stringify_string(source)})`;

			case 'Date':
				return `new Date(${thing.getTime()})`;

			case 'URL':
				return `new URL(${stringify_string(thing.toString())})`;

			case 'URLSearchParams':
				return `new URLSearchParams(${stringify_string(thing.toString())})`;

			case 'Array': {
				// For dense arrays (no holes), we iterate normally.
				// When we encounter the first hole, we call Object.keys
				// to determine the sparseness, then decide between:
				//   - Array literal with holes: [,"a",,] (default)
				//   - Object.assign: Object.assign(Array(n),{...}) (for very sparse arrays)
				// Only the Object.assign path avoids iterating every slot, which
				// is what protects against the DoS of e.g. `arr[1000000] = 1`.
				let has_holes = false;

				let result = '[';

				for (let i = 0; i < thing.length; i += 1) {
					if (i > 0) result += ',';

					if (Object.hasOwn(thing, i)) {
						result += stringify(thing[i]);
					} else if (!has_holes) {
						// Decide between array literal and Object.assign.
						//
						// Array literal: holes are consecutive commas.
						// For example, [, "a", ,] is written as [,"a",,].
						// Each hole costs 1 char (a comma).
						//
						// Object.assign: populated indices are listed explicitly.
						// For example, [, "a", ,] would be written as
						// Object.assign(Array(3),{1:"a"}). This avoids paying
						// per-hole, but has a large fixed overhead for the
						// "Object.assign(Array(n),{...})" wrapper, and each
						// element costs extra chars for its index and colon.
						//
						// The serialized values are the same size either way, so
						// the choice comes down to the structural overhead:
						//
						//   Array literal overhead:
						//     1 char per element or hole (comma separators)
						//     + 2 chars for "[" and "]"
						//     = L + 2
						//
						//   Object.assign overhead:
						//     "Object.assign(Array(" — 20 chars
						//     + length              — d chars
						//     + "),{"               — 3 chars
						//     + for each populated element:
						//       index + ":" + ","   — (d + 2) chars
						//     + "})"                — 2 chars
						//     = (25 + d) + P * (d + 2)
						//
						// where L is the array length, P is the number of
						// populated elements, and d is the number of digits
						// in L (an upper bound on the digits in any index).
						//
						// Object.assign is cheaper when:
						//   (25 + d) + P * (d + 2) < L + 2
						const populated_keys = valid_array_indices(/** @type {any[]} */ (thing));
						const population = populated_keys.length;
						const d = String(thing.length).length;

						const hole_cost = thing.length + 2;
						const sparse_cost = 25 + d + population * (d + 2);

						if (hole_cost > sparse_cost) {
							const entries = populated_keys.map((k) => `${k}:${stringify(thing[k])}`).join(',');
							return `Object.assign(Array(${thing.length}),{${entries}})`;
						}

						// Re-process this index as a hole in the array literal
						has_holes = true;
						i -= 1;
					}
					// else: already decided on array literal, hole is just an empty slot
					// (the comma separator is all we need — no content for this position)
				}

				const tail = thing.length === 0 || thing.length - 1 in thing ? '' : ',';
				return result + tail + ']';
			}

			case 'Set':
			case 'Map':
				return `new ${type}([${Array.from(thing).map(stringify).join(',')}])`;

			case 'Int8Array':
			case 'Uint8Array':
			case 'Uint8ClampedArray':
			case 'Int16Array':
			case 'Uint16Array':
			case 'Float16Array':
			case 'Int32Array':
			case 'Uint32Array':
			case 'Float32Array':
			case 'Float64Array':
			case 'BigInt64Array':
			case 'BigUint64Array': {
				let str = `new ${type}`;

				if (!names.has(thing.buffer)) {
					const array = new thing.constructor(thing.buffer);
					str += `([${array}])`;
				} else {
					str += `(${stringify(thing.buffer)})`;
				}

				// handle subarrays
				if (thing.byteLength !== thing.buffer.byteLength) {
					const start = thing.byteOffset / thing.BYTES_PER_ELEMENT;
					const end = start + thing.length;
					str += `.subarray(${start},${end})`;
				}

				return str;
			}

			case 'DataView': {
				let str = `new DataView`;

				if (!names.has(thing.buffer)) {
					str += `(new Uint8Array([${new Uint8Array(thing.buffer)}]).buffer`;
				} else {
					str += `(${stringify(thing.buffer)}`;
				}

				// handle subviews
				if (thing.byteLength !== thing.buffer.byteLength) {
					str += `,${thing.startOffset},${thing.byteLength}`;
				}

				return str + ')';
			}

			case 'ArrayBuffer': {
				const ui8 = new Uint8Array(thing);
				return `new Uint8Array([${ui8.toString()}]).buffer`;
			}

			case 'Temporal.Duration':
			case 'Temporal.Instant':
			case 'Temporal.PlainDate':
			case 'Temporal.PlainTime':
			case 'Temporal.PlainDateTime':
			case 'Temporal.PlainMonthDay':
			case 'Temporal.PlainYearMonth':
			case 'Temporal.ZonedDateTime':
				return `${type}.from(${stringify_string(thing.toString())})`;

			default:
				const keys = Object.keys(thing);
				const obj = keys.map((key) => `${safe_key(key)}:${stringify(thing[key])}`).join(',');
				const proto = Object.getPrototypeOf(thing);
				if (proto === null) {
					return keys.length > 0 ? `{${obj},__proto__:null}` : `{__proto__:null}`;
				}

				return `{${obj}}`;
		}
	}

	const str = stringify(value);

	if (names.size) {
		/** @type {string[]} */
		const params = [];

		/** @type {string[]} */
		const statements = [];

		/** @type {string[]} */
		const values = [];

		names.forEach((name, thing) => {
			params.push(name);

			if (custom.has(thing)) {
				const str = custom.get(thing);
				if (str !== undefined) {
					values.push(str);
					return;
				}
				const finalStr = replacer(thing, (value) => stringify(value));
				if (typeof finalStr === 'string') {
					values.push(finalStr);
					return;
				}
				throw new TypeError(
					'Replacer must return a string when called on a value it previously returned a string for'
				);
			}

			if (is_primitive(thing)) {
				values.push(stringify_primitive(thing));
				return;
			}

			const type = get_type(thing);

			switch (type) {
				case 'Number':
				case 'String':
				case 'Boolean':
				case 'BigInt':
					values.push(`Object(${stringify(thing.valueOf())})`);
					break;

				case 'RegExp':
					const { source, flags } = thing;
					const regexp = flags
						? `new RegExp(${stringify_string(source)},"${flags}")`
						: `new RegExp(${stringify_string(source)})`
					values.push(regexp);
					break;

				case 'Date':
					values.push(`new Date(${thing.getTime()})`);
					break;

				case 'URL':
					values.push(`new URL(${stringify_string(thing.toString())})`);
					break;

				case 'URLSearchParams':
					values.push(`new URLSearchParams(${stringify_string(thing.toString())})`);
					break;

				case 'Array':
					values.push(`Array(${thing.length})`);
					/** @type {any[]} */ (thing).forEach((v, i) => {
						statements.push(`${name}[${i}]=${stringify(v)}`);
					});
					break;

				case 'Set':
					values.push(`new Set`);
					statements.push(
						`${name}.${Array.from(thing)
							.map((v) => `add(${stringify(v)})`)
							.join('.')}`
					);
					break;

				case 'Map':
					values.push(`new Map`);
					statements.push(
						`${name}.${Array.from(thing)
							.map(([k, v]) => `set(${stringify(k)}, ${stringify(v)})`)
							.join('.')}`
					);
					break;

				case 'Int8Array':
				case 'Uint8Array':
				case 'Uint8ClampedArray':
				case 'Int16Array':
				case 'Uint16Array':
				case 'Float16Array':
				case 'Int32Array':
				case 'Uint32Array':
				case 'Float32Array':
				case 'Float64Array':
				case 'BigInt64Array':
				case 'BigUint64Array': {
					let str = `new ${type}`;

					if (!names.has(thing.buffer)) {
						const array = new thing.constructor(thing.buffer);
						str += `([${array}])`;
					} else {
						str += `(${stringify(thing.buffer)})`;
					}

					// handle subarrays
					if (thing.byteLength !== thing.buffer.byteLength) {
						const start = thing.byteOffset / thing.BYTES_PER_ELEMENT;
						const end = start + thing.length;
						str += `.subarray(${start},${end})`;
					}

					values.push(`{}`);
					statements.push(`${name}=${str}`);
					break;
				}

				case 'DataView': {
					let str = `new DataView`;

					if (!names.has(thing.buffer)) {
						str += `(new Uint8Array([${new Uint8Array(thing.buffer)}]).buffer`;
					} else {
						str += `(${stringify(thing.buffer)}`;
					}

					// handle subviews
					if (thing.byteLength !== thing.buffer.byteLength) {
						str += `,${thing.byteOffset},${thing.byteLength}`;
					}

					str += ')';

					values.push(`{}`);
					statements.push(`${name}=${str}`);
					break;
				}

				case 'ArrayBuffer':
					values.push(`new Uint8Array([${new Uint8Array(thing)}]).buffer`);
					break;

				default:
					values.push(Object.getPrototypeOf(thing) === null ? 'Object.create(null)' : '{}');
					Object.keys(thing).forEach((key) => {
						statements.push(`${name}${safe_prop(key)}=${stringify(thing[key])}`);
					});
			}
		});

		statements.push(`return ${str}`);

		return `(function(${params.join(',')}){${statements.join(';')}}(${values.join(',')}))`;
	} else {
		return str;
	}
}

/** @param {number} num */
function get_name(num) {
	let name = '';

	do {
		name = chars[num % chars.length] + name;
		num = ~~(num / chars.length) - 1;
	} while (num >= 0);

	return reserved.test(name) ? `${name}0` : name;
}

/** @param {string} c */
function escape_unsafe_char(c) {
	return escaped[c] || c;
}

/** @param {string} str */
function escape_unsafe_chars(str) {
	return str.replace(unsafe_chars, escape_unsafe_char);
}

/** @param {string} key */
function safe_key(key) {
	return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escape_unsafe_chars(JSON.stringify(key));
}

/** @param {string} key */
function safe_prop(key) {
	return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key)
		? `.${key}`
		: `[${escape_unsafe_chars(JSON.stringify(key))}]`;
}

/** @param {any} thing */
function stringify_primitive(thing) {
	const type = typeof thing;
	if (type === 'string') return stringify_string(thing);
	if (thing === void 0) return 'void 0';
	if (thing === 0 && 1 / thing < 0) return '-0';
	const str = String(thing);
	if (type === 'number') return str.replace(/^(-)?0\./, '$1.');
	if (type === 'bigint') return thing + 'n';
	return str;
}

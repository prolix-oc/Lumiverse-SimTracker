// @bun
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = import.meta.require;

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS((exports) => {
  var ALIAS = Symbol.for("yaml.alias");
  var DOC = Symbol.for("yaml.document");
  var MAP = Symbol.for("yaml.map");
  var PAIR = Symbol.for("yaml.pair");
  var SCALAR = Symbol.for("yaml.scalar");
  var SEQ = Symbol.for("yaml.seq");
  var NODE_TYPE = Symbol.for("yaml.node.type");
  var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
  var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
  var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
  var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
  var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
  var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
  function isCollection(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case MAP:
        case SEQ:
          return true;
      }
    return false;
  }
  function isNode(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case ALIAS:
        case MAP:
        case SCALAR:
        case SEQ:
          return true;
      }
    return false;
  }
  var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
  exports.ALIAS = ALIAS;
  exports.DOC = DOC;
  exports.MAP = MAP;
  exports.NODE_TYPE = NODE_TYPE;
  exports.PAIR = PAIR;
  exports.SCALAR = SCALAR;
  exports.SEQ = SEQ;
  exports.hasAnchor = hasAnchor;
  exports.isAlias = isAlias;
  exports.isCollection = isCollection;
  exports.isDocument = isDocument;
  exports.isMap = isMap;
  exports.isNode = isNode;
  exports.isPair = isPair;
  exports.isScalar = isScalar;
  exports.isSeq = isSeq;
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS((exports) => {
  var identity = require_identity();
  var BREAK = Symbol("break visit");
  var SKIP = Symbol("skip children");
  var REMOVE = Symbol("remove node");
  function visit(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      visit_(null, node, visitor_, Object.freeze([]));
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP;
  visit.REMOVE = REMOVE;
  function visit_(key, node, visitor, path) {
    const ctrl = callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visit_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = visit_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = visit_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = visit_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      await visitAsync_(null, node, visitor_, Object.freeze([]));
  }
  visitAsync.BREAK = BREAK;
  visitAsync.SKIP = SKIP;
  visitAsync.REMOVE = REMOVE;
  async function visitAsync_(key, node, visitor, path) {
    const ctrl = await callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visitAsync_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = await visitAsync_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = await visitAsync_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = await visitAsync_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  function initVisitor(visitor) {
    if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
      return Object.assign({
        Alias: visitor.Node,
        Map: visitor.Node,
        Scalar: visitor.Node,
        Seq: visitor.Node
      }, visitor.Value && {
        Map: visitor.Value,
        Scalar: visitor.Value,
        Seq: visitor.Value
      }, visitor.Collection && {
        Map: visitor.Collection,
        Seq: visitor.Collection
      }, visitor);
    }
    return visitor;
  }
  function callVisitor(key, node, visitor, path) {
    if (typeof visitor === "function")
      return visitor(key, node, path);
    if (identity.isMap(node))
      return visitor.Map?.(key, node, path);
    if (identity.isSeq(node))
      return visitor.Seq?.(key, node, path);
    if (identity.isPair(node))
      return visitor.Pair?.(key, node, path);
    if (identity.isScalar(node))
      return visitor.Scalar?.(key, node, path);
    if (identity.isAlias(node))
      return visitor.Alias?.(key, node, path);
    return;
  }
  function replaceNode(key, path, node) {
    const parent = path[path.length - 1];
    if (identity.isCollection(parent)) {
      parent.items[key] = node;
    } else if (identity.isPair(parent)) {
      if (key === "key")
        parent.key = node;
      else
        parent.value = node;
    } else if (identity.isDocument(parent)) {
      parent.contents = node;
    } else {
      const pt = identity.isAlias(parent) ? "alias" : "scalar";
      throw new Error(`Cannot replace node with ${pt} parent`);
    }
  }
  exports.visit = visit;
  exports.visitAsync = visitAsync;
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS((exports) => {
  var identity = require_identity();
  var visit = require_visit();
  var escapeChars = {
    "!": "%21",
    ",": "%2C",
    "[": "%5B",
    "]": "%5D",
    "{": "%7B",
    "}": "%7D"
  };
  var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);

  class Directives {
    constructor(yaml, tags) {
      this.docStart = null;
      this.docEnd = false;
      this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
      this.tags = Object.assign({}, Directives.defaultTags, tags);
    }
    clone() {
      const copy = new Directives(this.yaml, this.tags);
      copy.docStart = this.docStart;
      return copy;
    }
    atDocument() {
      const res = new Directives(this.yaml, this.tags);
      switch (this.yaml.version) {
        case "1.1":
          this.atNextDocument = true;
          break;
        case "1.2":
          this.atNextDocument = false;
          this.yaml = {
            explicit: Directives.defaultYaml.explicit,
            version: "1.2"
          };
          this.tags = Object.assign({}, Directives.defaultTags);
          break;
      }
      return res;
    }
    add(line, onError) {
      if (this.atNextDocument) {
        this.yaml = { explicit: Directives.defaultYaml.explicit, version: "1.1" };
        this.tags = Object.assign({}, Directives.defaultTags);
        this.atNextDocument = false;
      }
      const parts = line.trim().split(/[ \t]+/);
      const name = parts.shift();
      switch (name) {
        case "%TAG": {
          if (parts.length !== 2) {
            onError(0, "%TAG directive should contain exactly two parts");
            if (parts.length < 2)
              return false;
          }
          const [handle, prefix] = parts;
          this.tags[handle] = prefix;
          return true;
        }
        case "%YAML": {
          this.yaml.explicit = true;
          if (parts.length !== 1) {
            onError(0, "%YAML directive should contain exactly one part");
            return false;
          }
          const [version] = parts;
          if (version === "1.1" || version === "1.2") {
            this.yaml.version = version;
            return true;
          } else {
            const isValid = /^\d+\.\d+$/.test(version);
            onError(6, `Unsupported YAML version ${version}`, isValid);
            return false;
          }
        }
        default:
          onError(0, `Unknown directive ${name}`, true);
          return false;
      }
    }
    tagName(source, onError) {
      if (source === "!")
        return "!";
      if (source[0] !== "!") {
        onError(`Not a valid tag: ${source}`);
        return null;
      }
      if (source[1] === "<") {
        const verbatim = source.slice(2, -1);
        if (verbatim === "!" || verbatim === "!!") {
          onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
          return null;
        }
        if (source[source.length - 1] !== ">")
          onError("Verbatim tags must end with a >");
        return verbatim;
      }
      const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
      if (!suffix)
        onError(`The ${source} tag has no suffix`);
      const prefix = this.tags[handle];
      if (prefix) {
        try {
          return prefix + decodeURIComponent(suffix);
        } catch (error) {
          onError(String(error));
          return null;
        }
      }
      if (handle === "!")
        return source;
      onError(`Could not resolve tag: ${source}`);
      return null;
    }
    tagString(tag) {
      for (const [handle, prefix] of Object.entries(this.tags)) {
        if (tag.startsWith(prefix))
          return handle + escapeTagName(tag.substring(prefix.length));
      }
      return tag[0] === "!" ? tag : `!<${tag}>`;
    }
    toString(doc) {
      const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
      const tagEntries = Object.entries(this.tags);
      let tagNames;
      if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
        const tags = {};
        visit.visit(doc.contents, (_key, node) => {
          if (identity.isNode(node) && node.tag)
            tags[node.tag] = true;
        });
        tagNames = Object.keys(tags);
      } else
        tagNames = [];
      for (const [handle, prefix] of tagEntries) {
        if (handle === "!!" && prefix === "tag:yaml.org,2002:")
          continue;
        if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
          lines.push(`%TAG ${handle} ${prefix}`);
      }
      return lines.join(`
`);
    }
  }
  Directives.defaultYaml = { explicit: false, version: "1.2" };
  Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
  exports.Directives = Directives;
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS((exports) => {
  var identity = require_identity();
  var visit = require_visit();
  function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
      const sa = JSON.stringify(anchor);
      const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
      throw new Error(msg);
    }
    return true;
  }
  function anchorNames(root) {
    const anchors = new Set;
    visit.visit(root, {
      Value(_key, node) {
        if (node.anchor)
          anchors.add(node.anchor);
      }
    });
    return anchors;
  }
  function findNewAnchor(prefix, exclude) {
    for (let i = 1;; ++i) {
      const name = `${prefix}${i}`;
      if (!exclude.has(name))
        return name;
    }
  }
  function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = new Map;
    let prevAnchors = null;
    return {
      onAnchor: (source) => {
        aliasObjects.push(source);
        prevAnchors ?? (prevAnchors = anchorNames(doc));
        const anchor = findNewAnchor(prefix, prevAnchors);
        prevAnchors.add(anchor);
        return anchor;
      },
      setAnchors: () => {
        for (const source of aliasObjects) {
          const ref = sourceObjects.get(source);
          if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
            ref.node.anchor = ref.anchor;
          } else {
            const error = new Error("Failed to resolve repeated object (this should not happen)");
            error.source = source;
            throw error;
          }
        }
      },
      sourceObjects
    };
  }
  exports.anchorIsValid = anchorIsValid;
  exports.anchorNames = anchorNames;
  exports.createNodeAnchors = createNodeAnchors;
  exports.findNewAnchor = findNewAnchor;
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS((exports) => {
  function applyReviver(reviver, obj, key, val) {
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0, len = val.length;i < len; ++i) {
          const v0 = val[i];
          const v1 = applyReviver(reviver, val, String(i), v0);
          if (v1 === undefined)
            delete val[i];
          else if (v1 !== v0)
            val[i] = v1;
        }
      } else if (val instanceof Map) {
        for (const k of Array.from(val.keys())) {
          const v0 = val.get(k);
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            val.delete(k);
          else if (v1 !== v0)
            val.set(k, v1);
        }
      } else if (val instanceof Set) {
        for (const v0 of Array.from(val)) {
          const v1 = applyReviver(reviver, val, v0, v0);
          if (v1 === undefined)
            val.delete(v0);
          else if (v1 !== v0) {
            val.delete(v0);
            val.add(v1);
          }
        }
      } else {
        for (const [k, v0] of Object.entries(val)) {
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            delete val[k];
          else if (v1 !== v0)
            val[k] = v1;
        }
      }
    }
    return reviver.call(obj, key, val);
  }
  exports.applyReviver = applyReviver;
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS((exports) => {
  var identity = require_identity();
  function toJS(value, arg, ctx) {
    if (Array.isArray(value))
      return value.map((v, i) => toJS(v, String(i), ctx));
    if (value && typeof value.toJSON === "function") {
      if (!ctx || !identity.hasAnchor(value))
        return value.toJSON(arg, ctx);
      const data = { aliasCount: 0, count: 1, res: undefined };
      ctx.anchors.set(value, data);
      ctx.onCreate = (res2) => {
        data.res = res2;
        delete ctx.onCreate;
      };
      const res = value.toJSON(arg, ctx);
      if (ctx.onCreate)
        ctx.onCreate(res);
      return res;
    }
    if (typeof value === "bigint" && !ctx?.keep)
      return Number(value);
    return value;
  }
  exports.toJS = toJS;
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS((exports) => {
  var applyReviver = require_applyReviver();
  var identity = require_identity();
  var toJS = require_toJS();

  class NodeBase {
    constructor(type) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: type });
    }
    clone() {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      if (!identity.isDocument(doc))
        throw new TypeError("A document argument is required");
      const ctx = {
        anchors: new Map,
        doc,
        keep: true,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this, "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
  }
  exports.NodeBase = NodeBase;
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS((exports) => {
  var anchors = require_anchors();
  var visit = require_visit();
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();

  class Alias extends Node.NodeBase {
    constructor(source) {
      super(identity.ALIAS);
      this.source = source;
      Object.defineProperty(this, "tag", {
        set() {
          throw new Error("Alias nodes cannot have tags");
        }
      });
    }
    resolve(doc, ctx) {
      let nodes;
      if (ctx?.aliasResolveCache) {
        nodes = ctx.aliasResolveCache;
      } else {
        nodes = [];
        visit.visit(doc, {
          Node: (_key, node) => {
            if (identity.isAlias(node) || identity.hasAnchor(node))
              nodes.push(node);
          }
        });
        if (ctx)
          ctx.aliasResolveCache = nodes;
      }
      let found = undefined;
      for (const node of nodes) {
        if (node === this)
          break;
        if (node.anchor === this.source)
          found = node;
      }
      return found;
    }
    toJSON(_arg, ctx) {
      if (!ctx)
        return { source: this.source };
      const { anchors: anchors2, doc, maxAliasCount } = ctx;
      const source = this.resolve(doc, ctx);
      if (!source) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new ReferenceError(msg);
      }
      let data = anchors2.get(source);
      if (!data) {
        toJS.toJS(source, null, ctx);
        data = anchors2.get(source);
      }
      if (data?.res === undefined) {
        const msg = "This should not happen: Alias anchor was not resolved?";
        throw new ReferenceError(msg);
      }
      if (maxAliasCount >= 0) {
        data.count += 1;
        if (data.aliasCount === 0)
          data.aliasCount = getAliasCount(doc, source, anchors2);
        if (data.count * data.aliasCount > maxAliasCount) {
          const msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
      }
      return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
      const src = `*${this.source}`;
      if (ctx) {
        anchors.anchorIsValid(this.source);
        if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new Error(msg);
        }
        if (ctx.implicitKey)
          return `${src} `;
      }
      return src;
    }
  }
  function getAliasCount(doc, node, anchors2) {
    if (identity.isAlias(node)) {
      const source = node.resolve(doc);
      const anchor = anchors2 && source && anchors2.get(source);
      return anchor ? anchor.count * anchor.aliasCount : 0;
    } else if (identity.isCollection(node)) {
      let count = 0;
      for (const item of node.items) {
        const c = getAliasCount(doc, item, anchors2);
        if (c > count)
          count = c;
      }
      return count;
    } else if (identity.isPair(node)) {
      const kc = getAliasCount(doc, node.key, anchors2);
      const vc = getAliasCount(doc, node.value, anchors2);
      return Math.max(kc, vc);
    }
    return 1;
  }
  exports.Alias = Alias;
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS((exports) => {
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();
  var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";

  class Scalar extends Node.NodeBase {
    constructor(value) {
      super(identity.SCALAR);
      this.value = value;
    }
    toJSON(arg, ctx) {
      return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
    }
    toString() {
      return String(this.value);
    }
  }
  Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
  Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
  Scalar.PLAIN = "PLAIN";
  Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
  Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
  exports.Scalar = Scalar;
  exports.isScalarValue = isScalarValue;
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS((exports) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var defaultTagPrefix = "tag:yaml.org,2002:";
  function findTagObject(value, tagName, tags) {
    if (tagName) {
      const match = tags.filter((t) => t.tag === tagName);
      const tagObj = match.find((t) => !t.format) ?? match[0];
      if (!tagObj)
        throw new Error(`Tag ${tagName} not found`);
      return tagObj;
    }
    return tags.find((t) => t.identify?.(value) && !t.format);
  }
  function createNode(value, tagName, ctx) {
    if (identity.isDocument(value))
      value = value.contents;
    if (identity.isNode(value))
      return value;
    if (identity.isPair(value)) {
      const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
      map.items.push(value);
      return map;
    }
    if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
      value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
    let ref = undefined;
    if (aliasDuplicateObjects && value && typeof value === "object") {
      ref = sourceObjects.get(value);
      if (ref) {
        ref.anchor ?? (ref.anchor = onAnchor(value));
        return new Alias.Alias(ref.anchor);
      } else {
        ref = { anchor: null, node: null };
        sourceObjects.set(value, ref);
      }
    }
    if (tagName?.startsWith("!!"))
      tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema.tags);
    if (!tagObj) {
      if (value && typeof value.toJSON === "function") {
        value = value.toJSON();
      }
      if (!value || typeof value !== "object") {
        const node2 = new Scalar.Scalar(value);
        if (ref)
          ref.node = node2;
        return node2;
      }
      tagObj = value instanceof Map ? schema[identity.MAP] : (Symbol.iterator in Object(value)) ? schema[identity.SEQ] : schema[identity.MAP];
    }
    if (onTagObj) {
      onTagObj(tagObj);
      delete ctx.onTagObj;
    }
    const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
    if (tagName)
      node.tag = tagName;
    else if (!tagObj.default)
      node.tag = tagObj.tag;
    if (ref)
      ref.node = node;
    return node;
  }
  exports.createNode = createNode;
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS((exports) => {
  var createNode = require_createNode();
  var identity = require_identity();
  var Node = require_Node();
  function collectionFromPath(schema, path, value) {
    let v = value;
    for (let i = path.length - 1;i >= 0; --i) {
      const k = path[i];
      if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
        const a = [];
        a[k] = v;
        v = a;
      } else {
        v = new Map([[k, v]]);
      }
    }
    return createNode.createNode(v, undefined, {
      aliasDuplicateObjects: false,
      keepUndefined: false,
      onAnchor: () => {
        throw new Error("This should not happen, please report a bug.");
      },
      schema,
      sourceObjects: new Map
    });
  }
  var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;

  class Collection extends Node.NodeBase {
    constructor(type, schema) {
      super(type);
      Object.defineProperty(this, "schema", {
        value: schema,
        configurable: true,
        enumerable: false,
        writable: true
      });
    }
    clone(schema) {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (schema)
        copy.schema = schema;
      copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    addIn(path, value) {
      if (isEmptyPath(path))
        this.add(value);
      else {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.addIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
    deleteIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.delete(key);
      const node = this.get(key, true);
      if (identity.isCollection(node))
        return node.deleteIn(rest);
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    getIn(path, keepScalar) {
      const [key, ...rest] = path;
      const node = this.get(key, true);
      if (rest.length === 0)
        return !keepScalar && identity.isScalar(node) ? node.value : node;
      else
        return identity.isCollection(node) ? node.getIn(rest, keepScalar) : undefined;
    }
    hasAllNullValues(allowScalar) {
      return this.items.every((node) => {
        if (!identity.isPair(node))
          return false;
        const n = node.value;
        return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
      });
    }
    hasIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.has(key);
      const node = this.get(key, true);
      return identity.isCollection(node) ? node.hasIn(rest) : false;
    }
    setIn(path, value) {
      const [key, ...rest] = path;
      if (rest.length === 0) {
        this.set(key, value);
      } else {
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.setIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
  }
  exports.Collection = Collection;
  exports.collectionFromPath = collectionFromPath;
  exports.isEmptyPath = isEmptyPath;
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS((exports) => {
  var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
  function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
      return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
  }
  var lineComment = (str, indent, comment) => str.endsWith(`
`) ? indentComment(comment, indent) : comment.includes(`
`) ? `
` + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
  exports.indentComment = indentComment;
  exports.lineComment = lineComment;
  exports.stringifyComment = stringifyComment;
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS((exports) => {
  var FOLD_FLOW = "flow";
  var FOLD_BLOCK = "block";
  var FOLD_QUOTED = "quoted";
  function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
      return text;
    if (lineWidth < minContentWidth)
      minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
      return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === "number") {
      if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
        folds.push(0);
      else
        end = lineWidth - indentAtStart;
    }
    let split = undefined;
    let prev = undefined;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
      i = consumeMoreIndentedLines(text, i, indent.length);
      if (i !== -1)
        end = i + endStep;
    }
    for (let ch;ch = text[i += 1]; ) {
      if (mode === FOLD_QUOTED && ch === "\\") {
        escStart = i;
        switch (text[i + 1]) {
          case "x":
            i += 3;
            break;
          case "u":
            i += 5;
            break;
          case "U":
            i += 9;
            break;
          default:
            i += 1;
        }
        escEnd = i;
      }
      if (ch === `
`) {
        if (mode === FOLD_BLOCK)
          i = consumeMoreIndentedLines(text, i, indent.length);
        end = i + indent.length + endStep;
        split = undefined;
      } else {
        if (ch === " " && prev && prev !== " " && prev !== `
` && prev !== "\t") {
          const next = text[i + 1];
          if (next && next !== " " && next !== `
` && next !== "\t")
            split = i;
        }
        if (i >= end) {
          if (split) {
            folds.push(split);
            end = split + endStep;
            split = undefined;
          } else if (mode === FOLD_QUOTED) {
            while (prev === " " || prev === "\t") {
              prev = ch;
              ch = text[i += 1];
              overflow = true;
            }
            const j = i > escEnd + 1 ? i - 2 : escStart - 1;
            if (escapedFolds[j])
              return text;
            folds.push(j);
            escapedFolds[j] = true;
            end = j + endStep;
            split = undefined;
          } else {
            overflow = true;
          }
        }
      }
      prev = ch;
    }
    if (overflow && onOverflow)
      onOverflow();
    if (folds.length === 0)
      return text;
    if (onFold)
      onFold();
    let res = text.slice(0, folds[0]);
    for (let i2 = 0;i2 < folds.length; ++i2) {
      const fold = folds[i2];
      const end2 = folds[i2 + 1] || text.length;
      if (fold === 0)
        res = `
${indent}${text.slice(0, end2)}`;
      else {
        if (mode === FOLD_QUOTED && escapedFolds[fold])
          res += `${text[fold]}\\`;
        res += `
${indent}${text.slice(fold + 1, end2)}`;
      }
    }
    return res;
  }
  function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === " " || ch === "\t") {
      if (i < start + indent) {
        ch = text[++i];
      } else {
        do {
          ch = text[++i];
        } while (ch && ch !== `
`);
        end = i;
        start = i + 1;
        ch = text[start];
      }
    }
    return end;
  }
  exports.FOLD_BLOCK = FOLD_BLOCK;
  exports.FOLD_FLOW = FOLD_FLOW;
  exports.FOLD_QUOTED = FOLD_QUOTED;
  exports.foldFlowLines = foldFlowLines;
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var foldFlowLines = require_foldFlowLines();
  var getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
  });
  var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
  function lineLengthOverLimit(str, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
      return false;
    const limit = lineWidth - indentLength;
    const strLen = str.length;
    if (strLen <= limit)
      return false;
    for (let i = 0, start = 0;i < strLen; ++i) {
      if (str[i] === `
`) {
        if (i - start > limit)
          return true;
        start = i + 1;
        if (strLen - start <= limit)
          return false;
      }
    }
    return true;
  }
  function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
      return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    let str = "";
    let start = 0;
    for (let i = 0, ch = json[i];ch; ch = json[++i]) {
      if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
        str += json.slice(start, i) + "\\ ";
        i += 1;
        start = i;
        ch = "\\";
      }
      if (ch === "\\")
        switch (json[i + 1]) {
          case "u":
            {
              str += json.slice(start, i);
              const code = json.substr(i + 2, 4);
              switch (code) {
                case "0000":
                  str += "\\0";
                  break;
                case "0007":
                  str += "\\a";
                  break;
                case "000b":
                  str += "\\v";
                  break;
                case "001b":
                  str += "\\e";
                  break;
                case "0085":
                  str += "\\N";
                  break;
                case "00a0":
                  str += "\\_";
                  break;
                case "2028":
                  str += "\\L";
                  break;
                case "2029":
                  str += "\\P";
                  break;
                default:
                  if (code.substr(0, 2) === "00")
                    str += "\\x" + code.substr(2);
                  else
                    str += json.substr(i, 6);
              }
              i += 5;
              start = i + 1;
            }
            break;
          case "n":
            if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
              i += 1;
            } else {
              str += json.slice(start, i) + `

`;
              while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                str += `
`;
                i += 2;
              }
              str += indent;
              if (json[i + 2] === " ")
                str += "\\";
              i += 1;
              start = i + 1;
            }
            break;
          default:
            i += 1;
        }
    }
    str = start ? str + json.slice(start) : json;
    return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
  }
  function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes(`
`) || /[ \t]\n|\n[ \t]/.test(value))
      return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
    return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
      qs = doubleQuotedString;
    else {
      const hasDouble = value.includes('"');
      const hasSingle = value.includes("'");
      if (hasDouble && !hasSingle)
        qs = singleQuotedString;
      else if (hasSingle && !hasDouble)
        qs = doubleQuotedString;
      else
        qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
  }
  var blockEndNewlines;
  try {
    blockEndNewlines = new RegExp(`(^|(?<!
))
+(?!
|$)`, "g");
  } catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
  }
  function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
      return quotedString(value, ctx);
    }
    const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
    const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
      return literal ? `|
` : `>
`;
    let chomp;
    let endStart;
    for (endStart = value.length;endStart > 0; --endStart) {
      const ch = value[endStart - 1];
      if (ch !== `
` && ch !== "\t" && ch !== " ")
        break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf(`
`);
    if (endNlPos === -1) {
      chomp = "-";
    } else if (value === end || endNlPos !== end.length - 1) {
      chomp = "+";
      if (onChompKeep)
        onChompKeep();
    } else {
      chomp = "";
    }
    if (end) {
      value = value.slice(0, -end.length);
      if (end[end.length - 1] === `
`)
        end = end.slice(0, -1);
      end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0;startEnd < value.length; ++startEnd) {
      const ch = value[startEnd];
      if (ch === " ")
        startWithSpace = true;
      else if (ch === `
`)
        startNlPos = startEnd;
      else
        break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
      value = value.substring(start.length);
      start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? "2" : "1";
    let header = (startWithSpace ? indentSize : "") + chomp;
    if (comment) {
      header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
      if (onComment)
        onComment();
    }
    if (!literal) {
      const foldedValue = value.replace(/\n+/g, `
$&`).replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
      let literalFallback = false;
      const foldOptions = getFoldOptions(ctx, true);
      if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
        foldOptions.onOverflow = () => {
          literalFallback = true;
        };
      }
      const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
      if (!literalFallback)
        return `>${header}
${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}
${indent}${start}${value}${end}`;
  }
  function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if (implicitKey && value.includes(`
`) || inFlow && /[[\]{},]/.test(value)) {
      return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
      return implicitKey || inFlow || !value.includes(`
`) ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes(`
`)) {
      return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
      if (indent === "") {
        ctx.forceBlockIndent = true;
        return blockString(item, ctx, onComment, onChompKeep);
      } else if (implicitKey && indent === indentStep) {
        return quotedString(value, ctx);
      }
    }
    const str = value.replace(/\n+/g, `$&
${indent}`);
    if (actualString) {
      const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
      const { compat, tags } = ctx.doc.schema;
      if (tags.some(test) || compat?.some(test))
        return quotedString(value, ctx);
    }
    return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function stringifyString(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
        type = Scalar.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
      switch (_type) {
        case Scalar.Scalar.BLOCK_FOLDED:
        case Scalar.Scalar.BLOCK_LITERAL:
          return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
        case Scalar.Scalar.QUOTE_DOUBLE:
          return doubleQuotedString(ss.value, ctx);
        case Scalar.Scalar.QUOTE_SINGLE:
          return singleQuotedString(ss.value, ctx);
        case Scalar.Scalar.PLAIN:
          return plainString(ss, ctx, onComment, onChompKeep);
        default:
          return null;
      }
    };
    let res = _stringify(type);
    if (res === null) {
      const { defaultKeyType, defaultStringType } = ctx.options;
      const t = implicitKey && defaultKeyType || defaultStringType;
      res = _stringify(t);
      if (res === null)
        throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
  }
  exports.stringifyString = stringifyString;
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS((exports) => {
  var anchors = require_anchors();
  var identity = require_identity();
  var stringifyComment = require_stringifyComment();
  var stringifyString = require_stringifyString();
  function createStringifyContext(doc, options) {
    const opt = Object.assign({
      blockQuote: true,
      commentString: stringifyComment.stringifyComment,
      defaultKeyType: null,
      defaultStringType: "PLAIN",
      directives: null,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      falseStr: "false",
      flowCollectionPadding: true,
      indentSeq: true,
      lineWidth: 80,
      minContentWidth: 20,
      nullStr: "null",
      simpleKeys: false,
      singleQuote: null,
      trueStr: "true",
      verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
      case "block":
        inFlow = false;
        break;
      case "flow":
        inFlow = true;
        break;
      default:
        inFlow = null;
    }
    return {
      anchors: new Set,
      doc,
      flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
      indent: "",
      indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
      inFlow,
      options: opt
    };
  }
  function getTagObject(tags, item) {
    if (item.tag) {
      const match = tags.filter((t) => t.tag === item.tag);
      if (match.length > 0)
        return match.find((t) => t.format === item.format) ?? match[0];
    }
    let tagObj = undefined;
    let obj;
    if (identity.isScalar(item)) {
      obj = item.value;
      let match = tags.filter((t) => t.identify?.(obj));
      if (match.length > 1) {
        const testMatch = match.filter((t) => t.test);
        if (testMatch.length > 0)
          match = testMatch;
      }
      tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
    } else {
      obj = item;
      tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
      const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
      throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
  }
  function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
      return "";
    const props = [];
    const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
    if (anchor && anchors.anchorIsValid(anchor)) {
      anchors$1.add(anchor);
      props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
      props.push(doc.directives.tagString(tag));
    return props.join(" ");
  }
  function stringify(item, ctx, onComment, onChompKeep) {
    if (identity.isPair(item))
      return item.toString(ctx, onComment, onChompKeep);
    if (identity.isAlias(item)) {
      if (ctx.doc.directives)
        return item.toString(ctx);
      if (ctx.resolvedAliases?.has(item)) {
        throw new TypeError(`Cannot stringify circular structure without alias nodes`);
      } else {
        if (ctx.resolvedAliases)
          ctx.resolvedAliases.add(item);
        else
          ctx.resolvedAliases = new Set([item]);
        item = item.resolve(ctx.doc);
      }
    }
    let tagObj = undefined;
    const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
      ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
    if (!props)
      return str;
    return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
  }
  exports.createStringifyContext = createStringifyContext;
  exports.stringify = stringify;
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = identity.isNode(key) && key.comment || null;
    if (simpleKeys) {
      if (keyComment) {
        throw new Error("With simple keys, key nodes cannot have comments");
      }
      if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
        const msg = "With simple keys, collection cannot be used as a key value";
        throw new Error(msg);
      }
    }
    let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
    ctx = Object.assign({}, ctx, {
      allNullValues: false,
      implicitKey: !explicitKey && (simpleKeys || !allNullValues),
      indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
    if (!explicitKey && !ctx.inFlow && str.length > 1024) {
      if (simpleKeys)
        throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
      explicitKey = true;
    }
    if (ctx.inFlow) {
      if (allNullValues || value == null) {
        if (keyCommentDone && onComment)
          onComment();
        return str === "" ? "?" : explicitKey ? `? ${str}` : str;
      }
    } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
      str = `? ${str}`;
      if (keyComment && !keyCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    if (keyCommentDone)
      keyComment = null;
    if (explicitKey) {
      if (keyComment)
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      str = `? ${str}
${indent}:`;
    } else {
      str = `${str}:`;
      if (keyComment)
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity.isNode(value)) {
      vsb = !!value.spaceBefore;
      vcb = value.commentBefore;
      valueComment = value.comment;
    } else {
      vsb = false;
      vcb = null;
      valueComment = null;
      if (value && typeof value === "object")
        value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity.isScalar(value))
      ctx.indentAtStart = str.length + 1;
    chompKeep = false;
    if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
      ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
    let ws = " ";
    if (keyComment || vsb || vcb) {
      ws = vsb ? `
` : "";
      if (vcb) {
        const cs = commentString(vcb);
        ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
      }
      if (valueStr === "" && !ctx.inFlow) {
        if (ws === `
` && valueComment)
          ws = `

`;
      } else {
        ws += `
${ctx.indent}`;
      }
    } else if (!explicitKey && identity.isCollection(value)) {
      const vs0 = valueStr[0];
      const nl0 = valueStr.indexOf(`
`);
      const hasNewline = nl0 !== -1;
      const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
      if (hasNewline || !flow) {
        let hasPropsLine = false;
        if (hasNewline && (vs0 === "&" || vs0 === "!")) {
          let sp0 = valueStr.indexOf(" ");
          if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
            sp0 = valueStr.indexOf(" ", sp0 + 1);
          }
          if (sp0 === -1 || nl0 < sp0)
            hasPropsLine = true;
        }
        if (!hasPropsLine)
          ws = `
${ctx.indent}`;
      }
    } else if (valueStr === "" || valueStr[0] === `
`) {
      ws = "";
    }
    str += ws + valueStr;
    if (ctx.inFlow) {
      if (valueCommentDone && onComment)
        onComment();
    } else if (valueComment && !valueCommentDone) {
      str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
    } else if (chompKeep && onChompKeep) {
      onChompKeep();
    }
    return str;
  }
  exports.stringifyPair = stringifyPair;
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS((exports) => {
  var node_process = __require("process");
  function debug(logLevel, ...messages) {
    if (logLevel === "debug")
      console.log(...messages);
  }
  function warn(logLevel, warning) {
    if (logLevel === "debug" || logLevel === "warn") {
      if (typeof node_process.emitWarning === "function")
        node_process.emitWarning(warning);
      else
        console.warn(warning);
    }
  }
  exports.debug = debug;
  exports.warn = warn;
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var MERGE_KEY = "<<";
  var merge = {
    identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
    default: "key",
    tag: "tag:yaml.org,2002:merge",
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
      addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
  };
  var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
  function addMergeToJSMap(ctx, map, value) {
    value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
    if (identity.isSeq(value))
      for (const it of value.items)
        mergeValue(ctx, map, it);
    else if (Array.isArray(value))
      for (const it of value)
        mergeValue(ctx, map, it);
    else
      mergeValue(ctx, map, value);
  }
  function mergeValue(ctx, map, value) {
    const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
    if (!identity.isMap(source))
      throw new Error("Merge sources must be maps or map aliases");
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value2] of srcMap) {
      if (map instanceof Map) {
        if (!map.has(key))
          map.set(key, value2);
      } else if (map instanceof Set) {
        map.add(key);
      } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
        Object.defineProperty(map, key, {
          value: value2,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
    return map;
  }
  exports.addMergeToJSMap = addMergeToJSMap;
  exports.isMergeKey = isMergeKey;
  exports.merge = merge;
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS((exports) => {
  var log = require_log();
  var merge = require_merge();
  var stringify = require_stringify();
  var identity = require_identity();
  var toJS = require_toJS();
  function addPairToJSMap(ctx, map, { key, value }) {
    if (identity.isNode(key) && key.addToJSMap)
      key.addToJSMap(ctx, map, value);
    else if (merge.isMergeKey(ctx, key))
      merge.addMergeToJSMap(ctx, map, value);
    else {
      const jsKey = toJS.toJS(key, "", ctx);
      if (map instanceof Map) {
        map.set(jsKey, toJS.toJS(value, jsKey, ctx));
      } else if (map instanceof Set) {
        map.add(jsKey);
      } else {
        const stringKey = stringifyKey(key, jsKey, ctx);
        const jsValue = toJS.toJS(value, stringKey, ctx);
        if (stringKey in map)
          Object.defineProperty(map, stringKey, {
            value: jsValue,
            writable: true,
            enumerable: true,
            configurable: true
          });
        else
          map[stringKey] = jsValue;
      }
    }
    return map;
  }
  function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
      return "";
    if (typeof jsKey !== "object")
      return String(jsKey);
    if (identity.isNode(key) && ctx?.doc) {
      const strCtx = stringify.createStringifyContext(ctx.doc, {});
      strCtx.anchors = new Set;
      for (const node of ctx.anchors.keys())
        strCtx.anchors.add(node.anchor);
      strCtx.inFlow = true;
      strCtx.inStringifyKey = true;
      const strKey = key.toString(strCtx);
      if (!ctx.mapKeyWarned) {
        let jsonStr = JSON.stringify(strKey);
        if (jsonStr.length > 40)
          jsonStr = jsonStr.substring(0, 36) + '..."';
        log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
        ctx.mapKeyWarned = true;
      }
      return strKey;
    }
    return JSON.stringify(jsKey);
  }
  exports.addPairToJSMap = addPairToJSMap;
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS((exports) => {
  var createNode = require_createNode();
  var stringifyPair = require_stringifyPair();
  var addPairToJSMap = require_addPairToJSMap();
  var identity = require_identity();
  function createPair(key, value, ctx) {
    const k = createNode.createNode(key, undefined, ctx);
    const v = createNode.createNode(value, undefined, ctx);
    return new Pair(k, v);
  }

  class Pair {
    constructor(key, value = null) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
      this.key = key;
      this.value = value;
    }
    clone(schema) {
      let { key, value } = this;
      if (identity.isNode(key))
        key = key.clone(schema);
      if (identity.isNode(value))
        value = value.clone(schema);
      return new Pair(key, value);
    }
    toJSON(_, ctx) {
      const pair = ctx?.mapAsMap ? new Map : {};
      return addPairToJSMap.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
      return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
    }
  }
  exports.Pair = Pair;
  exports.createPair = createPair;
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS((exports) => {
  var identity = require_identity();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyCollection(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify2(collection, ctx, options);
  }
  function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment2 = null;
      if (identity.isNode(item)) {
        if (!chompKeep && item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
        if (item.comment)
          comment2 = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (!chompKeep && ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
        }
      }
      chompKeep = false;
      let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
      if (comment2)
        str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
      if (chompKeep && comment2)
        chompKeep = false;
      lines.push(blockItemPrefix + str2);
    }
    let str;
    if (lines.length === 0) {
      str = flowChars.start + flowChars.end;
    } else {
      str = lines[0];
      for (let i = 1;i < lines.length; ++i) {
        const line = lines[i];
        str += line ? `
${indent}${line}` : `
`;
      }
    }
    if (comment) {
      str += `
` + stringifyComment.indentComment(commentString(comment), indent);
      if (onComment)
        onComment();
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
      indent: itemIndent,
      inFlow: true,
      type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment = null;
      if (identity.isNode(item)) {
        if (item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, false);
        if (item.comment)
          comment = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, false);
          if (ik.comment)
            reqNewline = true;
        }
        const iv = identity.isNode(item.value) ? item.value : null;
        if (iv) {
          if (iv.comment)
            comment = iv.comment;
          if (iv.commentBefore)
            reqNewline = true;
        } else if (item.value == null && ik?.comment) {
          comment = ik.comment;
        }
      }
      if (comment)
        reqNewline = true;
      let str = stringify.stringify(item, itemCtx, () => comment = null);
      if (i < items.length - 1)
        str += ",";
      if (comment)
        str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
      if (!reqNewline && (lines.length > linesAtValue || str.includes(`
`)))
        reqNewline = true;
      lines.push(str);
      linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
      return start + end;
    } else {
      if (!reqNewline) {
        const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
        reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
      }
      if (reqNewline) {
        let str = start;
        for (const line of lines)
          str += line ? `
${indentStep}${indent}${line}` : `
`;
        return `${str}
${indent}${end}`;
      } else {
        return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
      }
    }
  }
  function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
      comment = comment.replace(/^\n+/, "");
    if (comment) {
      const ic = stringifyComment.indentComment(commentString(comment), indent);
      lines.push(ic.trimStart());
    }
  }
  exports.stringifyCollection = stringifyCollection;
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS((exports) => {
  var stringifyCollection = require_stringifyCollection();
  var addPairToJSMap = require_addPairToJSMap();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  function findPair(items, key) {
    const k = identity.isScalar(key) ? key.value : key;
    for (const it of items) {
      if (identity.isPair(it)) {
        if (it.key === key || it.key === k)
          return it;
        if (identity.isScalar(it.key) && it.key.value === k)
          return it;
      }
    }
    return;
  }

  class YAMLMap extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:map";
    }
    constructor(schema) {
      super(identity.MAP, schema);
      this.items = [];
    }
    static from(schema, obj, ctx) {
      const { keepUndefined, replacer } = ctx;
      const map = new this(schema);
      const add = (key, value) => {
        if (typeof replacer === "function")
          value = replacer.call(obj, key, value);
        else if (Array.isArray(replacer) && !replacer.includes(key))
          return;
        if (value !== undefined || keepUndefined)
          map.items.push(Pair.createPair(key, value, ctx));
      };
      if (obj instanceof Map) {
        for (const [key, value] of obj)
          add(key, value);
      } else if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj))
          add(key, obj[key]);
      }
      if (typeof schema.sortMapEntries === "function") {
        map.items.sort(schema.sortMapEntries);
      }
      return map;
    }
    add(pair, overwrite) {
      let _pair;
      if (identity.isPair(pair))
        _pair = pair;
      else if (!pair || typeof pair !== "object" || !("key" in pair)) {
        _pair = new Pair.Pair(pair, pair?.value);
      } else
        _pair = new Pair.Pair(pair.key, pair.value);
      const prev = findPair(this.items, _pair.key);
      const sortEntries = this.schema?.sortMapEntries;
      if (prev) {
        if (!overwrite)
          throw new Error(`Key ${_pair.key} already set`);
        if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
          prev.value.value = _pair.value;
        else
          prev.value = _pair.value;
      } else if (sortEntries) {
        const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
        if (i === -1)
          this.items.push(_pair);
        else
          this.items.splice(i, 0, _pair);
      } else {
        this.items.push(_pair);
      }
    }
    delete(key) {
      const it = findPair(this.items, key);
      if (!it)
        return false;
      const del = this.items.splice(this.items.indexOf(it), 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const it = findPair(this.items, key);
      const node = it?.value;
      return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? undefined;
    }
    has(key) {
      return !!findPair(this.items, key);
    }
    set(key, value) {
      this.add(new Pair.Pair(key, value), true);
    }
    toJSON(_, ctx, Type) {
      const map = Type ? new Type : ctx?.mapAsMap ? new Map : {};
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const item of this.items)
        addPairToJSMap.addPairToJSMap(ctx, map, item);
      return map;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      for (const item of this.items) {
        if (!identity.isPair(item))
          throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
      }
      if (!ctx.allNullValues && this.hasAllNullValues(false))
        ctx = Object.assign({}, ctx, { allNullValues: true });
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "",
        flowChars: { start: "{", end: "}" },
        itemIndent: ctx.indent || "",
        onChompKeep,
        onComment
      });
    }
  }
  exports.YAMLMap = YAMLMap;
  exports.findPair = findPair;
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS((exports) => {
  var identity = require_identity();
  var YAMLMap = require_YAMLMap();
  var map = {
    collection: "map",
    default: true,
    nodeClass: YAMLMap.YAMLMap,
    tag: "tag:yaml.org,2002:map",
    resolve(map2, onError) {
      if (!identity.isMap(map2))
        onError("Expected a mapping for this tag");
      return map2;
    },
    createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
  };
  exports.map = map;
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS((exports) => {
  var createNode = require_createNode();
  var stringifyCollection = require_stringifyCollection();
  var Collection = require_Collection();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var toJS = require_toJS();

  class YAMLSeq extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:seq";
    }
    constructor(schema) {
      super(identity.SEQ, schema);
      this.items = [];
    }
    add(value) {
      this.items.push(value);
    }
    delete(key) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return false;
      const del = this.items.splice(idx, 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return;
      const it = this.items[idx];
      return !keepScalar && identity.isScalar(it) ? it.value : it;
    }
    has(key) {
      const idx = asItemIndex(key);
      return typeof idx === "number" && idx < this.items.length;
    }
    set(key, value) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        throw new Error(`Expected a valid index, not ${key}.`);
      const prev = this.items[idx];
      if (identity.isScalar(prev) && Scalar.isScalarValue(value))
        prev.value = value;
      else
        this.items[idx] = value;
    }
    toJSON(_, ctx) {
      const seq = [];
      if (ctx?.onCreate)
        ctx.onCreate(seq);
      let i = 0;
      for (const item of this.items)
        seq.push(toJS.toJS(item, String(i++), ctx));
      return seq;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "- ",
        flowChars: { start: "[", end: "]" },
        itemIndent: (ctx.indent || "") + "  ",
        onChompKeep,
        onComment
      });
    }
    static from(schema, obj, ctx) {
      const { replacer } = ctx;
      const seq = new this(schema);
      if (obj && Symbol.iterator in Object(obj)) {
        let i = 0;
        for (let it of obj) {
          if (typeof replacer === "function") {
            const key = obj instanceof Set ? it : String(i++);
            it = replacer.call(obj, key, it);
          }
          seq.items.push(createNode.createNode(it, undefined, ctx));
        }
      }
      return seq;
    }
  }
  function asItemIndex(key) {
    let idx = identity.isScalar(key) ? key.value : key;
    if (idx && typeof idx === "string")
      idx = Number(idx);
    return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
  }
  exports.YAMLSeq = YAMLSeq;
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS((exports) => {
  var identity = require_identity();
  var YAMLSeq = require_YAMLSeq();
  var seq = {
    collection: "seq",
    default: true,
    nodeClass: YAMLSeq.YAMLSeq,
    tag: "tag:yaml.org,2002:seq",
    resolve(seq2, onError) {
      if (!identity.isSeq(seq2))
        onError("Expected a sequence for this tag");
      return seq2;
    },
    createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
  };
  exports.seq = seq;
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS((exports) => {
  var stringifyString = require_stringifyString();
  var string = {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify(item, ctx, onComment, onChompKeep) {
      ctx = Object.assign({ actualString: true }, ctx);
      return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
    }
  };
  exports.string = string;
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var nullTag = {
    identify: (value) => value == null,
    createNode: () => new Scalar.Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
  };
  exports.nullTag = nullTag;
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var boolTag = {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
    stringify({ source, value }, ctx) {
      if (source && boolTag.test.test(source)) {
        const sv = source[0] === "t" || source[0] === "T";
        if (value === sv)
          return source;
      }
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
  };
  exports.boolTag = boolTag;
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS((exports) => {
  function stringifyNumber({ format, minFractionDigits, tag, value }) {
    if (typeof value === "bigint")
      return String(value);
    const num = typeof value === "number" ? value : Number(value);
    if (!isFinite(num))
      return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
    let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
    if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
      let i = n.indexOf(".");
      if (i < 0) {
        i = n.length;
        n += ".";
      }
      let d = minFractionDigits - (n.length - i - 1);
      while (d-- > 0)
        n += "0";
    }
    return n;
  }
  exports.stringifyNumber = stringifyNumber;
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str) {
      const node = new Scalar.Scalar(parseFloat(str));
      const dot = str.indexOf(".");
      if (dot !== -1 && str[str.length - 1] === "0")
        node.minFractionDigits = str.length - dot - 1;
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports.float = float;
  exports.floatExp = floatExp;
  exports.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
      return prefix + value.toString(radix);
    return stringifyNumber.stringifyNumber(node);
  }
  var intOct = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^0o[0-7]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
    stringify: (node) => intStringify(node, 8, "0o")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports.int = int;
  exports.intHex = intHex;
  exports.intOct = intOct;
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.boolTag,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float
  ];
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var map = require_map();
  var seq = require_seq();
  function intIdentify(value) {
    return typeof value === "bigint" || Number.isInteger(value);
  }
  var stringifyJSON = ({ value }) => JSON.stringify(value);
  var jsonScalars = [
    {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify: stringifyJSON
    },
    {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^null$/,
      resolve: () => null,
      stringify: stringifyJSON
    },
    {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^true$|^false$/,
      resolve: (str) => str === "true",
      stringify: stringifyJSON
    },
    {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^-?(?:0|[1-9][0-9]*)$/,
      resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
      stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
      resolve: (str) => parseFloat(str),
      stringify: stringifyJSON
    }
  ];
  var jsonError = {
    default: true,
    tag: "",
    test: /^/,
    resolve(str, onError) {
      onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
      return str;
    }
  };
  var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS((exports) => {
  var node_buffer = __require("buffer");
  var Scalar = require_Scalar();
  var stringifyString = require_stringifyString();
  var binary = {
    identify: (value) => value instanceof Uint8Array,
    default: false,
    tag: "tag:yaml.org,2002:binary",
    resolve(src, onError) {
      if (typeof node_buffer.Buffer === "function") {
        return node_buffer.Buffer.from(src, "base64");
      } else if (typeof atob === "function") {
        const str = atob(src.replace(/[\n\r]/g, ""));
        const buffer = new Uint8Array(str.length);
        for (let i = 0;i < str.length; ++i)
          buffer[i] = str.charCodeAt(i);
        return buffer;
      } else {
        onError("This environment does not support reading binary tags; either Buffer or atob is required");
        return src;
      }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
      if (!value)
        return "";
      const buf = value;
      let str;
      if (typeof node_buffer.Buffer === "function") {
        str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
      } else if (typeof btoa === "function") {
        let s = "";
        for (let i = 0;i < buf.length; ++i)
          s += String.fromCharCode(buf[i]);
        str = btoa(s);
      } else {
        throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
      }
      type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
        const n = Math.ceil(str.length / lineWidth);
        const lines = new Array(n);
        for (let i = 0, o = 0;i < n; ++i, o += lineWidth) {
          lines[i] = str.substr(o, lineWidth);
        }
        str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? `
` : " ");
      }
      return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
    }
  };
  exports.binary = binary;
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  var YAMLSeq = require_YAMLSeq();
  function resolvePairs(seq, onError) {
    if (identity.isSeq(seq)) {
      for (let i = 0;i < seq.items.length; ++i) {
        let item = seq.items[i];
        if (identity.isPair(item))
          continue;
        else if (identity.isMap(item)) {
          if (item.items.length > 1)
            onError("Each pair must have its own sequence indicator");
          const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
          if (item.commentBefore)
            pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
          if (item.comment) {
            const cn = pair.value ?? pair.key;
            cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
          }
          item = pair;
        }
        seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
      }
    } else
      onError("Expected a sequence for this tag");
    return seq;
  }
  function createPairs(schema, iterable, ctx) {
    const { replacer } = ctx;
    const pairs2 = new YAMLSeq.YAMLSeq(schema);
    pairs2.tag = "tag:yaml.org,2002:pairs";
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
      for (let it of iterable) {
        if (typeof replacer === "function")
          it = replacer.call(iterable, String(i++), it);
        let key, value;
        if (Array.isArray(it)) {
          if (it.length === 2) {
            key = it[0];
            value = it[1];
          } else
            throw new TypeError(`Expected [key, value] tuple: ${it}`);
        } else if (it && it instanceof Object) {
          const keys = Object.keys(it);
          if (keys.length === 1) {
            key = keys[0];
            value = it[key];
          } else {
            throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
          }
        } else {
          key = it;
        }
        pairs2.items.push(Pair.createPair(key, value, ctx));
      }
    return pairs2;
  }
  var pairs = {
    collection: "seq",
    default: false,
    tag: "tag:yaml.org,2002:pairs",
    resolve: resolvePairs,
    createNode: createPairs
  };
  exports.createPairs = createPairs;
  exports.pairs = pairs;
  exports.resolvePairs = resolvePairs;
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS((exports) => {
  var identity = require_identity();
  var toJS = require_toJS();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var pairs = require_pairs();

  class YAMLOMap extends YAMLSeq.YAMLSeq {
    constructor() {
      super();
      this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
      this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
      this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
      this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
      this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
      this.tag = YAMLOMap.tag;
    }
    toJSON(_, ctx) {
      if (!ctx)
        return super.toJSON(_);
      const map = new Map;
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const pair of this.items) {
        let key, value;
        if (identity.isPair(pair)) {
          key = toJS.toJS(pair.key, "", ctx);
          value = toJS.toJS(pair.value, key, ctx);
        } else {
          key = toJS.toJS(pair, "", ctx);
        }
        if (map.has(key))
          throw new Error("Ordered maps must not include duplicate keys");
        map.set(key, value);
      }
      return map;
    }
    static from(schema, iterable, ctx) {
      const pairs$1 = pairs.createPairs(schema, iterable, ctx);
      const omap2 = new this;
      omap2.items = pairs$1.items;
      return omap2;
    }
  }
  YAMLOMap.tag = "tag:yaml.org,2002:omap";
  var omap = {
    collection: "seq",
    identify: (value) => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: "tag:yaml.org,2002:omap",
    resolve(seq, onError) {
      const pairs$1 = pairs.resolvePairs(seq, onError);
      const seenKeys = [];
      for (const { key } of pairs$1.items) {
        if (identity.isScalar(key)) {
          if (seenKeys.includes(key.value)) {
            onError(`Ordered maps must not include duplicate keys: ${key.value}`);
          } else {
            seenKeys.push(key.value);
          }
        }
      }
      return Object.assign(new YAMLOMap, pairs$1);
    },
    createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
  };
  exports.YAMLOMap = YAMLOMap;
  exports.omap = omap;
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
      return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
  var trueTag = {
    identify: (value) => value === true,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar.Scalar(true),
    stringify: boolStringify
  };
  var falseTag = {
    identify: (value) => value === false,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar.Scalar(false),
    stringify: boolStringify
  };
  exports.falseTag = falseTag;
  exports.trueTag = trueTag;
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str.replace(/_/g, "")),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str) {
      const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
      const dot = str.indexOf(".");
      if (dot !== -1) {
        const f = str.substring(dot + 1).replace(/_/g, "");
        if (f[f.length - 1] === "0")
          node.minFractionDigits = f.length;
      }
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports.float = float;
  exports.floatExp = floatExp;
  exports.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  function intResolve(str, offset, radix, { intAsBigInt }) {
    const sign = str[0];
    if (sign === "-" || sign === "+")
      offset += 1;
    str = str.substring(offset).replace(/_/g, "");
    if (intAsBigInt) {
      switch (radix) {
        case 2:
          str = `0b${str}`;
          break;
        case 8:
          str = `0o${str}`;
          break;
        case 16:
          str = `0x${str}`;
          break;
      }
      const n2 = BigInt(str);
      return sign === "-" ? BigInt(-1) * n2 : n2;
    }
    const n = parseInt(str, radix);
    return sign === "-" ? -1 * n : n;
  }
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
      const str = value.toString(radix);
      return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
    }
    return stringifyNumber.stringifyNumber(node);
  }
  var intBin = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "BIN",
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
    stringify: (node) => intStringify(node, 2, "0b")
  };
  var intOct = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
    stringify: (node) => intStringify(node, 8, "0")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports.int = int;
  exports.intBin = intBin;
  exports.intHex = intHex;
  exports.intOct = intOct;
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();

  class YAMLSet extends YAMLMap.YAMLMap {
    constructor(schema) {
      super(schema);
      this.tag = YAMLSet.tag;
    }
    add(key) {
      let pair;
      if (identity.isPair(key))
        pair = key;
      else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
        pair = new Pair.Pair(key.key, null);
      else
        pair = new Pair.Pair(key, null);
      const prev = YAMLMap.findPair(this.items, pair.key);
      if (!prev)
        this.items.push(pair);
    }
    get(key, keepPair) {
      const pair = YAMLMap.findPair(this.items, key);
      return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
    }
    set(key, value) {
      if (typeof value !== "boolean")
        throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
      const prev = YAMLMap.findPair(this.items, key);
      if (prev && !value) {
        this.items.splice(this.items.indexOf(prev), 1);
      } else if (!prev && value) {
        this.items.push(new Pair.Pair(key));
      }
    }
    toJSON(_, ctx) {
      return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      if (this.hasAllNullValues(true))
        return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
      else
        throw new Error("Set items must all have null values");
    }
    static from(schema, iterable, ctx) {
      const { replacer } = ctx;
      const set2 = new this(schema);
      if (iterable && Symbol.iterator in Object(iterable))
        for (let value of iterable) {
          if (typeof replacer === "function")
            value = replacer.call(iterable, value, value);
          set2.items.push(Pair.createPair(value, null, ctx));
        }
      return set2;
    }
  }
  YAMLSet.tag = "tag:yaml.org,2002:set";
  var set = {
    collection: "map",
    identify: (value) => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: "tag:yaml.org,2002:set",
    createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
    resolve(map, onError) {
      if (identity.isMap(map)) {
        if (map.hasAllNullValues(true))
          return Object.assign(new YAMLSet, map);
        else
          onError("Set items must all have null values");
      } else
        onError("Expected a mapping for this tag");
      return map;
    }
  };
  exports.YAMLSet = YAMLSet;
  exports.set = set;
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  function parseSexagesimal(str, asBigInt) {
    const sign = str[0];
    const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
    return sign === "-" ? num(-1) * res : res;
  }
  function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === "bigint")
      num = (n) => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
      return stringifyNumber.stringifyNumber(node);
    let sign = "";
    if (value < 0) {
      sign = "-";
      value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60];
    if (value < 60) {
      parts.unshift(0);
    } else {
      value = (value - parts[0]) / _60;
      parts.unshift(value % _60);
      if (value >= 60) {
        value = (value - parts[0]) / _60;
        parts.unshift(value);
      }
    }
    return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
  }
  var intTime = {
    identify: (value) => typeof value === "bigint" || Number.isInteger(value),
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
    stringify: stringifySexagesimal
  };
  var floatTime = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: (str) => parseSexagesimal(str, false),
    stringify: stringifySexagesimal
  };
  var timestamp = {
    identify: (value) => value instanceof Date,
    default: true,
    tag: "tag:yaml.org,2002:timestamp",
    test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})" + "(?:" + "(?:t|T|[ \\t]+)" + "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)" + "(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?" + ")?$"),
    resolve(str) {
      const match = str.match(timestamp.test);
      if (!match)
        throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
      const [, year, month, day, hour, minute, second] = match.map(Number);
      const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
      let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
      const tz = match[8];
      if (tz && tz !== "Z") {
        let d = parseSexagesimal(tz, false);
        if (Math.abs(d) < 30)
          d *= 60;
        date -= 60000 * d;
      }
      return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
  };
  exports.floatTime = floatTime;
  exports.intTime = intTime;
  exports.timestamp = timestamp;
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var binary = require_binary();
  var bool = require_bool2();
  var float = require_float2();
  var int = require_int2();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var set = require_set();
  var timestamp = require_timestamp();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.trueTag,
    bool.falseTag,
    int.intBin,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float,
    binary.binary,
    merge.merge,
    omap.omap,
    pairs.pairs,
    set.set,
    timestamp.intTime,
    timestamp.floatTime,
    timestamp.timestamp
  ];
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = require_schema();
  var schema$1 = require_schema2();
  var binary = require_binary();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var schema$2 = require_schema3();
  var set = require_set();
  var timestamp = require_timestamp();
  var schemas = new Map([
    ["core", schema.schema],
    ["failsafe", [map.map, seq.seq, string.string]],
    ["json", schema$1.schema],
    ["yaml11", schema$2.schema],
    ["yaml-1.1", schema$2.schema]
  ]);
  var tagsByName = {
    binary: binary.binary,
    bool: bool.boolTag,
    float: float.float,
    floatExp: float.floatExp,
    floatNaN: float.floatNaN,
    floatTime: timestamp.floatTime,
    int: int.int,
    intHex: int.intHex,
    intOct: int.intOct,
    intTime: timestamp.intTime,
    map: map.map,
    merge: merge.merge,
    null: _null.nullTag,
    omap: omap.omap,
    pairs: pairs.pairs,
    seq: seq.seq,
    set: set.set,
    timestamp: timestamp.timestamp
  };
  var coreKnownTags = {
    "tag:yaml.org,2002:binary": binary.binary,
    "tag:yaml.org,2002:merge": merge.merge,
    "tag:yaml.org,2002:omap": omap.omap,
    "tag:yaml.org,2002:pairs": pairs.pairs,
    "tag:yaml.org,2002:set": set.set,
    "tag:yaml.org,2002:timestamp": timestamp.timestamp
  };
  function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
      return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
    }
    let tags = schemaTags;
    if (!tags) {
      if (Array.isArray(customTags))
        tags = [];
      else {
        const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
      }
    }
    if (Array.isArray(customTags)) {
      for (const tag of customTags)
        tags = tags.concat(tag);
    } else if (typeof customTags === "function") {
      tags = customTags(tags.slice());
    }
    if (addMergeTag)
      tags = tags.concat(merge.merge);
    return tags.reduce((tags2, tag) => {
      const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
      if (!tagObj) {
        const tagName = JSON.stringify(tag);
        const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
      }
      if (!tags2.includes(tagObj))
        tags2.push(tagObj);
      return tags2;
    }, []);
  }
  exports.coreKnownTags = coreKnownTags;
  exports.getTags = getTags;
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS((exports) => {
  var identity = require_identity();
  var map = require_map();
  var seq = require_seq();
  var string = require_string();
  var tags = require_tags();
  var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

  class Schema {
    constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
      this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
      this.name = typeof schema === "string" && schema || "core";
      this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
      this.tags = tags.getTags(customTags, this.name, merge);
      this.toStringOptions = toStringDefaults ?? null;
      Object.defineProperty(this, identity.MAP, { value: map.map });
      Object.defineProperty(this, identity.SCALAR, { value: string.string });
      Object.defineProperty(this, identity.SEQ, { value: seq.seq });
      this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
    }
    clone() {
      const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
      copy.tags = this.tags.slice();
      return copy;
    }
  }
  exports.Schema = Schema;
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS((exports) => {
  var identity = require_identity();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyDocument(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
      const dir = doc.directives.toString(doc);
      if (dir) {
        lines.push(dir);
        hasDirectives = true;
      } else if (doc.directives.docStart)
        hasDirectives = true;
    }
    if (hasDirectives)
      lines.push("---");
    const ctx = stringify.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
      if (lines.length !== 1)
        lines.unshift("");
      const cs = commentString(doc.commentBefore);
      lines.unshift(stringifyComment.indentComment(cs, ""));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
      if (identity.isNode(doc.contents)) {
        if (doc.contents.spaceBefore && hasDirectives)
          lines.push("");
        if (doc.contents.commentBefore) {
          const cs = commentString(doc.contents.commentBefore);
          lines.push(stringifyComment.indentComment(cs, ""));
        }
        ctx.forceBlockIndent = !!doc.comment;
        contentComment = doc.contents.comment;
      }
      const onChompKeep = contentComment ? undefined : () => chompKeep = true;
      let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
      if (contentComment)
        body += stringifyComment.lineComment(body, "", commentString(contentComment));
      if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
        lines[lines.length - 1] = `--- ${body}`;
      } else
        lines.push(body);
    } else {
      lines.push(stringify.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
      if (doc.comment) {
        const cs = commentString(doc.comment);
        if (cs.includes(`
`)) {
          lines.push("...");
          lines.push(stringifyComment.indentComment(cs, ""));
        } else {
          lines.push(`... ${cs}`);
        }
      } else {
        lines.push("...");
      }
    } else {
      let dc = doc.comment;
      if (dc && chompKeep)
        dc = dc.replace(/^\n+/, "");
      if (dc) {
        if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
          lines.push("");
        lines.push(stringifyComment.indentComment(commentString(dc), ""));
      }
    }
    return lines.join(`
`) + `
`;
  }
  exports.stringifyDocument = stringifyDocument;
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS((exports) => {
  var Alias = require_Alias();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var toJS = require_toJS();
  var Schema = require_Schema();
  var stringifyDocument = require_stringifyDocument();
  var anchors = require_anchors();
  var applyReviver = require_applyReviver();
  var createNode = require_createNode();
  var directives = require_directives();

  class Document {
    constructor(value, replacer, options) {
      this.commentBefore = null;
      this.comment = null;
      this.errors = [];
      this.warnings = [];
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const opt = Object.assign({
        intAsBigInt: false,
        keepSourceTokens: false,
        logLevel: "warn",
        prettyErrors: true,
        strict: true,
        stringKeys: false,
        uniqueKeys: true,
        version: "1.2"
      }, options);
      this.options = opt;
      let { version } = opt;
      if (options?._directives) {
        this.directives = options._directives.atDocument();
        if (this.directives.yaml.explicit)
          version = this.directives.yaml.version;
      } else
        this.directives = new directives.Directives({ version });
      this.setSchema(version, options);
      this.contents = value === undefined ? null : this.createNode(value, _replacer, options);
    }
    clone() {
      const copy = Object.create(Document.prototype, {
        [identity.NODE_TYPE]: { value: identity.DOC }
      });
      copy.commentBefore = this.commentBefore;
      copy.comment = this.comment;
      copy.errors = this.errors.slice();
      copy.warnings = this.warnings.slice();
      copy.options = Object.assign({}, this.options);
      if (this.directives)
        copy.directives = this.directives.clone();
      copy.schema = this.schema.clone();
      copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    add(value) {
      if (assertCollection(this.contents))
        this.contents.add(value);
    }
    addIn(path, value) {
      if (assertCollection(this.contents))
        this.contents.addIn(path, value);
    }
    createAlias(node, name) {
      if (!node.anchor) {
        const prev = anchors.anchorNames(this);
        node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
      }
      return new Alias.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
      let _replacer = undefined;
      if (typeof replacer === "function") {
        value = replacer.call({ "": value }, "", value);
        _replacer = replacer;
      } else if (Array.isArray(replacer)) {
        const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
        const asStr = replacer.filter(keyToStr).map(String);
        if (asStr.length > 0)
          replacer = replacer.concat(asStr);
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
      const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, anchorPrefix || "a");
      const ctx = {
        aliasDuplicateObjects: aliasDuplicateObjects ?? true,
        keepUndefined: keepUndefined ?? false,
        onAnchor,
        onTagObj,
        replacer: _replacer,
        schema: this.schema,
        sourceObjects
      };
      const node = createNode.createNode(value, tag, ctx);
      if (flow && identity.isCollection(node))
        node.flow = true;
      setAnchors();
      return node;
    }
    createPair(key, value, options = {}) {
      const k = this.createNode(key, null, options);
      const v = this.createNode(value, null, options);
      return new Pair.Pair(k, v);
    }
    delete(key) {
      return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    deleteIn(path) {
      if (Collection.isEmptyPath(path)) {
        if (this.contents == null)
          return false;
        this.contents = null;
        return true;
      }
      return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
    }
    get(key, keepScalar) {
      return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : undefined;
    }
    getIn(path, keepScalar) {
      if (Collection.isEmptyPath(path))
        return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
      return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : undefined;
    }
    has(key) {
      return identity.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    hasIn(path) {
      if (Collection.isEmptyPath(path))
        return this.contents !== undefined;
      return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
    }
    set(key, value) {
      if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, [key], value);
      } else if (assertCollection(this.contents)) {
        this.contents.set(key, value);
      }
    }
    setIn(path, value) {
      if (Collection.isEmptyPath(path)) {
        this.contents = value;
      } else if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
      } else if (assertCollection(this.contents)) {
        this.contents.setIn(path, value);
      }
    }
    setSchema(version, options = {}) {
      if (typeof version === "number")
        version = String(version);
      let opt;
      switch (version) {
        case "1.1":
          if (this.directives)
            this.directives.yaml.version = "1.1";
          else
            this.directives = new directives.Directives({ version: "1.1" });
          opt = { resolveKnownTags: false, schema: "yaml-1.1" };
          break;
        case "1.2":
        case "next":
          if (this.directives)
            this.directives.yaml.version = version;
          else
            this.directives = new directives.Directives({ version });
          opt = { resolveKnownTags: true, schema: "core" };
          break;
        case null:
          if (this.directives)
            delete this.directives;
          opt = null;
          break;
        default: {
          const sv = JSON.stringify(version);
          throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
        }
      }
      if (options.schema instanceof Object)
        this.schema = options.schema;
      else if (opt)
        this.schema = new Schema.Schema(Object.assign(opt, options));
      else
        throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      const ctx = {
        anchors: new Map,
        doc: this,
        keep: !json,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
    toJSON(jsonArg, onAnchor) {
      return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    toString(options = {}) {
      if (this.errors.length > 0)
        throw new Error("Document with errors cannot be stringified");
      if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
        const s = JSON.stringify(options.indent);
        throw new Error(`"indent" option must be a positive integer, not ${s}`);
      }
      return stringifyDocument.stringifyDocument(this, options);
    }
  }
  function assertCollection(contents) {
    if (identity.isCollection(contents))
      return true;
    throw new Error("Expected a YAML collection as document contents");
  }
  exports.Document = Document;
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS((exports) => {
  class YAMLError extends Error {
    constructor(name, pos, code, message) {
      super();
      this.name = name;
      this.code = code;
      this.message = message;
      this.pos = pos;
    }
  }

  class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLParseError", pos, code, message);
    }
  }

  class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLWarning", pos, code, message);
    }
  }
  var prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
      return;
    error.linePos = error.pos.map((pos) => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
    if (ci >= 60 && lineStr.length > 80) {
      const trimStart = Math.min(ci - 39, lineStr.length - 79);
      lineStr = "\u2026" + lineStr.substring(trimStart);
      ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
      lineStr = lineStr.substring(0, 79) + "\u2026";
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
      let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
      if (prev.length > 80)
        prev = prev.substring(0, 79) + `\u2026
`;
      lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
      let count = 1;
      const end = error.linePos[1];
      if (end?.line === line && end.col > col) {
        count = Math.max(1, Math.min(end.col - col, 80 - ci));
      }
      const pointer = " ".repeat(ci) + "^".repeat(count);
      error.message += `:

${lineStr}
${pointer}
`;
    }
  };
  exports.YAMLError = YAMLError;
  exports.YAMLParseError = YAMLParseError;
  exports.YAMLWarning = YAMLWarning;
  exports.prettifyError = prettifyError;
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS((exports) => {
  function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = "";
    let commentSep = "";
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
      if (reqSpace) {
        if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
          onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
        reqSpace = false;
      }
      if (tab) {
        if (atNewline && token.type !== "comment" && token.type !== "newline") {
          onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
        }
        tab = null;
      }
      switch (token.type) {
        case "space":
          if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("\t")) {
            tab = token;
          }
          hasSpace = true;
          break;
        case "comment": {
          if (!hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = token.source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += commentSep + cb;
          commentSep = "";
          atNewline = false;
          break;
        }
        case "newline":
          if (atNewline) {
            if (comment)
              comment += token.source;
            else if (!found || indicator !== "seq-item-ind")
              spaceBefore = true;
          } else
            commentSep += token.source;
          atNewline = true;
          hasNewline = true;
          if (anchor || tag)
            newlineAfterProp = token;
          hasSpace = true;
          break;
        case "anchor":
          if (anchor)
            onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
          if (token.source.endsWith(":"))
            onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
          anchor = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        case "tag": {
          if (tag)
            onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
          tag = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        }
        case indicator:
          if (anchor || tag)
            onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
          if (found)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
          found = token;
          atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
          hasSpace = false;
          break;
        case "comma":
          if (flow) {
            if (comma)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
            comma = token;
            atNewline = false;
            hasSpace = false;
            break;
          }
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
          atNewline = false;
          hasSpace = false;
      }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
      onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
    }
    if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
      onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
    return {
      comma,
      found,
      spaceBefore,
      comment,
      hasNewline,
      anchor,
      tag,
      newlineAfterProp,
      end,
      start: start ?? end
    };
  }
  exports.resolveProps = resolveProps;
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS((exports) => {
  function containsNewline(key) {
    if (!key)
      return null;
    switch (key.type) {
      case "alias":
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        if (key.source.includes(`
`))
          return true;
        if (key.end) {
          for (const st of key.end)
            if (st.type === "newline")
              return true;
        }
        return false;
      case "flow-collection":
        for (const it of key.items) {
          for (const st of it.start)
            if (st.type === "newline")
              return true;
          if (it.sep) {
            for (const st of it.sep)
              if (st.type === "newline")
                return true;
          }
          if (containsNewline(it.key) || containsNewline(it.value))
            return true;
        }
        return false;
      default:
        return true;
    }
  }
  exports.containsNewline = containsNewline;
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS((exports) => {
  var utilContainsNewline = require_util_contains_newline();
  function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === "flow-collection") {
      const end = fc.end[0];
      if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
        const msg = "Flow end indicator should be more indented than parent";
        onError(end, "BAD_INDENT", msg, true);
      }
    }
  }
  exports.flowIndentCheck = flowIndentCheck;
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS((exports) => {
  var identity = require_identity();
  function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
      return false;
    const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
    return items.some((pair) => isEqual(pair.key, search));
  }
  exports.mapIncludes = mapIncludes;
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS((exports) => {
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  var utilMapIncludes = require_util_map_includes();
  var startColMsg = "All mapping items must start at the same column";
  function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
    const map = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
      const { start, key, sep, value } = collItem;
      const keyProps = resolveProps.resolveProps(start, {
        indicator: "explicit-key-ind",
        next: key ?? sep?.[0],
        offset,
        onError,
        parentIndent: bm.indent,
        startOnNewline: true
      });
      const implicitKey = !keyProps.found;
      if (implicitKey) {
        if (key) {
          if (key.type === "block-seq")
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
          else if ("indent" in key && key.indent !== bm.indent)
            onError(offset, "BAD_INDENT", startColMsg);
        }
        if (!keyProps.anchor && !keyProps.tag && !sep) {
          commentEnd = keyProps.end;
          if (keyProps.comment) {
            if (map.comment)
              map.comment += `
` + keyProps.comment;
            else
              map.comment = keyProps.comment;
          }
          continue;
        }
        if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
          onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
        }
      } else if (keyProps.found?.indent !== bm.indent) {
        onError(offset, "BAD_INDENT", startColMsg);
      }
      ctx.atKey = true;
      const keyStart = keyProps.end;
      const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
      ctx.atKey = false;
      if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
        onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
      const valueProps = resolveProps.resolveProps(sep ?? [], {
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: bm.indent,
        startOnNewline: !key || key.type === "block-scalar"
      });
      offset = valueProps.end;
      if (valueProps.found) {
        if (implicitKey) {
          if (value?.type === "block-map" && !valueProps.hasNewline)
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
          if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
            onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
        offset = valueNode.range[2];
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      } else {
        if (implicitKey)
          onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
        if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      }
    }
    if (commentEnd && commentEnd < offset)
      onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
    map.range = [bm.offset, offset, commentEnd ?? offset];
    return map;
  }
  exports.resolveBlockMap = resolveBlockMap;
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS((exports) => {
  var YAMLSeq = require_YAMLSeq();
  var resolveProps = require_resolve_props();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
    const seq = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
      const props = resolveProps.resolveProps(start, {
        indicator: "seq-item-ind",
        next: value,
        offset,
        onError,
        parentIndent: bs.indent,
        startOnNewline: true
      });
      if (!props.found) {
        if (props.anchor || props.tag || value) {
          if (value?.type === "block-seq")
            onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
          else
            onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
        } else {
          commentEnd = props.end;
          if (props.comment)
            seq.comment = props.comment;
          continue;
        }
      }
      const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
      offset = node.range[2];
      seq.items.push(node);
    }
    seq.range = [bs.offset, offset, commentEnd ?? offset];
    return seq;
  }
  exports.resolveBlockSeq = resolveBlockSeq;
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS((exports) => {
  function resolveEnd(end, offset, reqSpace, onError) {
    let comment = "";
    if (end) {
      let hasSpace = false;
      let sep = "";
      for (const token of end) {
        const { source, type } = token;
        switch (type) {
          case "space":
            hasSpace = true;
            break;
          case "comment": {
            if (reqSpace && !hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += sep + cb;
            sep = "";
            break;
          }
          case "newline":
            if (comment)
              sep += source;
            hasSpace = true;
            break;
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
        }
        offset += source.length;
      }
    }
    return { comment, offset };
  }
  exports.resolveEnd = resolveEnd;
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilMapIncludes = require_util_map_includes();
  var blockMsg = "Block collections are not allowed within flow collections";
  var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
  function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === "{";
    const fcName = isMap ? "flow map" : "flow sequence";
    const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0;i < fc.items.length; ++i) {
      const collItem = fc.items[i];
      const { start, key, sep, value } = collItem;
      const props = resolveProps.resolveProps(start, {
        flow: fcName,
        indicator: "explicit-key-ind",
        next: key ?? sep?.[0],
        offset,
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (!props.found) {
        if (!props.anchor && !props.tag && !sep && !value) {
          if (i === 0 && props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
          else if (i < fc.items.length - 1)
            onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
          if (props.comment) {
            if (coll.comment)
              coll.comment += `
` + props.comment;
            else
              coll.comment = props.comment;
          }
          offset = props.end;
          continue;
        }
        if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
          onError(key, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
      }
      if (i === 0) {
        if (props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
      } else {
        if (!props.comma)
          onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
        if (props.comment) {
          let prevItemComment = "";
          loop:
            for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
          if (prevItemComment) {
            let prev = coll.items[coll.items.length - 1];
            if (identity.isPair(prev))
              prev = prev.value ?? prev.key;
            if (prev.comment)
              prev.comment += `
` + prevItemComment;
            else
              prev.comment = prevItemComment;
            props.comment = props.comment.substring(prevItemComment.length + 1);
          }
        }
      }
      if (!isMap && !sep && !props.found) {
        const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
        coll.items.push(valueNode);
        offset = valueNode.range[2];
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else {
        ctx.atKey = true;
        const keyStart = props.end;
        const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
        if (isBlock(key))
          onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
        ctx.atKey = false;
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          flow: fcName,
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (valueProps.found) {
          if (!isMap && !props.found && ctx.options.strict) {
            if (sep)
              for (const st of sep) {
                if (st === valueProps.found)
                  break;
                if (st.type === "newline") {
                  onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                  break;
                }
              }
            if (props.start < valueProps.found.offset - 1024)
              onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
          }
        } else if (value) {
          if ("source" in value && value.source?.[0] === ":")
            onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
          else
            onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
        if (valueNode) {
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        if (isMap) {
          const map = coll;
          if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
            onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
          map.items.push(pair);
        } else {
          const map = new YAMLMap.YAMLMap(ctx.schema);
          map.flow = true;
          map.items.push(pair);
          const endRange = (valueNode ?? keyNode).range;
          map.range = [keyNode.range[0], endRange[1], endRange[2]];
          coll.items.push(map);
        }
        offset = valueNode ? valueNode.range[2] : valueProps.end;
      }
    }
    const expectedEnd = isMap ? "}" : "]";
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce?.source === expectedEnd)
      cePos = ce.offset + ce.source.length;
    else {
      const name = fcName[0].toUpperCase() + fcName.substring(1);
      const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
      onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
      if (ce && ce.source.length !== 1)
        ee.unshift(ce);
    }
    if (ee.length > 0) {
      const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
      if (end.comment) {
        if (coll.comment)
          coll.comment += `
` + end.comment;
        else
          coll.comment = end.comment;
      }
      coll.range = [fc.offset, cePos, end.offset];
    } else {
      coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
  }
  exports.resolveFlowCollection = resolveFlowCollection;
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveBlockMap = require_resolve_block_map();
  var resolveBlockSeq = require_resolve_block_seq();
  var resolveFlowCollection = require_resolve_flow_collection();
  function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    if (tagName === "!" || tagName === Coll.tagName) {
      coll.tag = Coll.tagName;
      return coll;
    }
    if (tagName)
      coll.tag = tagName;
    return coll;
  }
  function composeCollection(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
    if (token.type === "block-seq") {
      const { anchor, newlineAfterProp: nl } = props;
      const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
      if (lastProp && (!nl || nl.offset < lastProp.offset)) {
        const message = "Missing newline after block sequence props";
        onError(lastProp, "MISSING_CHAR", message);
      }
    }
    const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
    if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
      return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
    if (!tag) {
      const kt = ctx.schema.knownTags[tagName];
      if (kt?.collection === expType) {
        ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
        tag = kt;
      } else {
        if (kt) {
          onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
        } else {
          onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
        }
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
    const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
      node.format = tag.format;
    return node;
  }
  exports.composeCollection = composeCollection;
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS((exports) => {
  var Scalar = require_Scalar();
  function resolveBlockScalar(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
      return { value: "", type: null, comment: "", range: [start, start, start] };
    const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    let chompStart = lines.length;
    for (let i = lines.length - 1;i >= 0; --i) {
      const content = lines[i][1];
      if (content === "" || content === "\r")
        chompStart = i;
      else
        break;
    }
    if (chompStart === 0) {
      const value2 = header.chomp === "+" && lines.length > 0 ? `
`.repeat(Math.max(1, lines.length - 1)) : "";
      let end2 = start + header.length;
      if (scalar.source)
        end2 += scalar.source.length;
      return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
    }
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0;i < chompStart; ++i) {
      const [indent, content] = lines[i];
      if (content === "" || content === "\r") {
        if (header.indent === 0 && indent.length > trimIndent)
          trimIndent = indent.length;
      } else {
        if (indent.length < trimIndent) {
          const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
          onError(offset + indent.length, "MISSING_CHAR", message);
        }
        if (header.indent === 0)
          trimIndent = indent.length;
        contentStart = i;
        if (trimIndent === 0 && !ctx.atRoot) {
          const message = "Block scalar values in collections must be indented";
          onError(offset, "BAD_INDENT", message);
        }
        break;
      }
      offset += indent.length + content.length + 1;
    }
    for (let i = lines.length - 1;i >= chompStart; --i) {
      if (lines[i][0].length > trimIndent)
        chompStart = i + 1;
    }
    let value = "";
    let sep = "";
    let prevMoreIndented = false;
    for (let i = 0;i < contentStart; ++i)
      value += lines[i][0].slice(trimIndent) + `
`;
    for (let i = contentStart;i < chompStart; ++i) {
      let [indent, content] = lines[i];
      offset += indent.length + content.length + 1;
      const crlf = content[content.length - 1] === "\r";
      if (crlf)
        content = content.slice(0, -1);
      if (content && indent.length < trimIndent) {
        const src = header.indent ? "explicit indentation indicator" : "first line";
        const message = `Block scalar lines must not be less indented than their ${src}`;
        onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
        indent = "";
      }
      if (type === Scalar.Scalar.BLOCK_LITERAL) {
        value += sep + indent.slice(trimIndent) + content;
        sep = `
`;
      } else if (indent.length > trimIndent || content[0] === "\t") {
        if (sep === " ")
          sep = `
`;
        else if (!prevMoreIndented && sep === `
`)
          sep = `

`;
        value += sep + indent.slice(trimIndent) + content;
        sep = `
`;
        prevMoreIndented = true;
      } else if (content === "") {
        if (sep === `
`)
          value += `
`;
        else
          sep = `
`;
      } else {
        value += sep + content;
        sep = " ";
        prevMoreIndented = false;
      }
    }
    switch (header.chomp) {
      case "-":
        break;
      case "+":
        for (let i = chompStart;i < lines.length; ++i)
          value += `
` + lines[i][0].slice(trimIndent);
        if (value[value.length - 1] !== `
`)
          value += `
`;
        break;
      default:
        value += `
`;
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
  }
  function parseBlockScalarHeader({ offset, props }, strict, onError) {
    if (props[0].type !== "block-scalar-header") {
      onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
      return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = "";
    let error = -1;
    for (let i = 1;i < source.length; ++i) {
      const ch = source[i];
      if (!chomp && (ch === "-" || ch === "+"))
        chomp = ch;
      else {
        const n = Number(ch);
        if (!indent && n)
          indent = n;
        else if (error === -1)
          error = offset + i;
      }
    }
    if (error !== -1)
      onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = "";
    let length = source.length;
    for (let i = 1;i < props.length; ++i) {
      const token = props[i];
      switch (token.type) {
        case "space":
          hasSpace = true;
        case "newline":
          length += token.source.length;
          break;
        case "comment":
          if (strict && !hasSpace) {
            const message = "Comments must be separated from other tokens by white space characters";
            onError(token, "MISSING_CHAR", message);
          }
          length += token.source.length;
          comment = token.source.substring(1);
          break;
        case "error":
          onError(token, "UNEXPECTED_TOKEN", token.message);
          length += token.source.length;
          break;
        default: {
          const message = `Unexpected token in block scalar header: ${token.type}`;
          onError(token, "UNEXPECTED_TOKEN", message);
          const ts = token.source;
          if (ts && typeof ts === "string")
            length += ts.length;
        }
      }
    }
    return { mode, indent, chomp, comment, length };
  }
  function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
    const lines = [line0];
    for (let i = 1;i < split.length; i += 2)
      lines.push([split[i], split[i + 1]]);
    return lines;
  }
  exports.resolveBlockScalar = resolveBlockScalar;
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var resolveEnd = require_resolve_end();
  function resolveFlowScalar(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
      case "scalar":
        _type = Scalar.Scalar.PLAIN;
        value = plainValue(source, _onError);
        break;
      case "single-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_SINGLE;
        value = singleQuotedValue(source, _onError);
        break;
      case "double-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_DOUBLE;
        value = doubleQuotedValue(source, _onError);
        break;
      default:
        onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
        return {
          value: "",
          type: null,
          comment: "",
          range: [offset, offset + source.length, offset + source.length]
        };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
    return {
      value,
      type: _type,
      comment: re.comment,
      range: [offset, valueEnd, re.offset]
    };
  }
  function plainValue(source, onError) {
    let badChar = "";
    switch (source[0]) {
      case "\t":
        badChar = "a tab character";
        break;
      case ",":
        badChar = "flow indicator character ,";
        break;
      case "%":
        badChar = "directive indicator character %";
        break;
      case "|":
      case ">": {
        badChar = `block scalar indicator ${source[0]}`;
        break;
      }
      case "@":
      case "`": {
        badChar = `reserved character ${source[0]}`;
        break;
      }
    }
    if (badChar)
      onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
    return foldLines(source);
  }
  function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
      onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
  }
  function foldLines(source) {
    let first, line;
    try {
      first = new RegExp(`(.*?)(?<![ 	])[ 	]*\r?
`, "sy");
      line = new RegExp(`[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?
`, "sy");
    } catch {
      first = /(.*?)[ \t]*\r?\n/sy;
      line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
      return source;
    let res = match[1];
    let sep = " ";
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while (match = line.exec(source)) {
      if (match[1] === "") {
        if (sep === `
`)
          res += sep;
        else
          sep = `
`;
      } else {
        res += sep + match[1];
        sep = " ";
      }
      pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep + (match?.[1] ?? "");
  }
  function doubleQuotedValue(source, onError) {
    let res = "";
    for (let i = 1;i < source.length - 1; ++i) {
      const ch = source[i];
      if (ch === "\r" && source[i + 1] === `
`)
        continue;
      if (ch === `
`) {
        const { fold, offset } = foldNewline(source, i);
        res += fold;
        i = offset;
      } else if (ch === "\\") {
        let next = source[++i];
        const cc = escapeCodes[next];
        if (cc)
          res += cc;
        else if (next === `
`) {
          next = source[i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "\r" && source[i + 1] === `
`) {
          next = source[++i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "x" || next === "u" || next === "U") {
          const length = { x: 2, u: 4, U: 8 }[next];
          res += parseCharCode(source, i + 1, length, onError);
          i += length;
        } else {
          const raw = source.substr(i - 1, 2);
          onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
          res += raw;
        }
      } else if (ch === " " || ch === "\t") {
        const wsStart = i;
        let next = source[i + 1];
        while (next === " " || next === "\t")
          next = source[++i + 1];
        if (next !== `
` && !(next === "\r" && source[i + 2] === `
`))
          res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
      } else {
        res += ch;
      }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
      onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
    return res;
  }
  function foldNewline(source, offset) {
    let fold = "";
    let ch = source[offset + 1];
    while (ch === " " || ch === "\t" || ch === `
` || ch === "\r") {
      if (ch === "\r" && source[offset + 2] !== `
`)
        break;
      if (ch === `
`)
        fold += `
`;
      offset += 1;
      ch = source[offset + 1];
    }
    if (!fold)
      fold = " ";
    return { fold, offset };
  }
  var escapeCodes = {
    "0": "\x00",
    a: "\x07",
    b: "\b",
    e: "\x1B",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v",
    N: "\x85",
    _: "\xA0",
    L: "\u2028",
    P: "\u2029",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    "\t": "\t"
  };
  function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    if (isNaN(code)) {
      const raw = source.substr(offset - 2, length + 2);
      onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
      return raw;
    }
    return String.fromCodePoint(code);
  }
  exports.resolveFlowScalar = resolveFlowScalar;
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  function composeScalar(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
      tag = ctx.schema[identity.SCALAR];
    } else if (tagName)
      tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === "scalar")
      tag = findScalarTagByTest(ctx, value, token, onError);
    else
      tag = ctx.schema[identity.SCALAR];
    let scalar;
    try {
      const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
      scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
      scalar = new Scalar.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
      scalar.type = type;
    if (tagName)
      scalar.tag = tagName;
    if (tag.format)
      scalar.format = tag.format;
    if (comment)
      scalar.comment = comment;
    return scalar;
  }
  function findScalarTagByName(schema, value, tagName, tagToken, onError) {
    if (tagName === "!")
      return schema[identity.SCALAR];
    const matchWithTest = [];
    for (const tag of schema.tags) {
      if (!tag.collection && tag.tag === tagName) {
        if (tag.default && tag.test)
          matchWithTest.push(tag);
        else
          return tag;
      }
    }
    for (const tag of matchWithTest)
      if (tag.test?.test(value))
        return tag;
    const kt = schema.knownTags[tagName];
    if (kt && !kt.collection) {
      schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }));
      return kt;
    }
    onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
    return schema[identity.SCALAR];
  }
  function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
    const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
    if (schema.compat) {
      const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
      if (tag.tag !== compat.tag) {
        const ts = directives.tagString(tag.tag);
        const cs = directives.tagString(compat.tag);
        const msg = `Value may be parsed as either ${ts} or ${cs}`;
        onError(token, "TAG_RESOLVE_FAILED", msg, true);
      }
    }
    return tag;
  }
  exports.composeScalar = composeScalar;
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS((exports) => {
  function emptyScalarPosition(offset, before, pos) {
    if (before) {
      pos ?? (pos = before.length);
      for (let i = pos - 1;i >= 0; --i) {
        let st = before[i];
        switch (st.type) {
          case "space":
          case "comment":
          case "newline":
            offset -= st.source.length;
            continue;
        }
        st = before[++i];
        while (st?.type === "space") {
          offset += st.source.length;
          st = before[++i];
        }
        break;
      }
    }
    return offset;
  }
  exports.emptyScalarPosition = emptyScalarPosition;
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS((exports) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var composeCollection = require_compose_collection();
  var composeScalar = require_compose_scalar();
  var resolveEnd = require_resolve_end();
  var utilEmptyScalarPosition = require_util_empty_scalar_position();
  var CN = { composeNode, composeEmptyNode };
  function composeNode(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
      case "alias":
        node = composeAlias(ctx, token, onError);
        if (anchor || tag)
          onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
        break;
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "block-scalar":
        node = composeScalar.composeScalar(ctx, token, tag, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      case "block-map":
      case "block-seq":
      case "flow-collection":
        node = composeCollection.composeCollection(CN, ctx, token, props, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      default: {
        const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
        onError(token, "UNEXPECTED_TOKEN", message);
        node = composeEmptyNode(ctx, token.offset, undefined, null, props, onError);
        isSrcToken = false;
      }
    }
    if (anchor && node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
      const msg = "With stringKeys, all keys must be strings";
      onError(tag ?? token, "NON_STRING_KEY", msg);
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      if (token.type === "scalar" && token.source === "")
        node.comment = comment;
      else
        node.commentBefore = comment;
    }
    if (ctx.options.keepSourceTokens && isSrcToken)
      node.srcToken = token;
    return node;
  }
  function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
      type: "scalar",
      offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
      indent: -1,
      source: ""
    };
    const node = composeScalar.composeScalar(ctx, token, tag, onError);
    if (anchor) {
      node.anchor = anchor.source.substring(1);
      if (node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      node.comment = comment;
      node.range[2] = end;
    }
    return node;
  }
  function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias.Alias(source.substring(1));
    if (alias.source === "")
      onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
    if (alias.source.endsWith(":"))
      onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
      alias.comment = re.comment;
    return alias;
  }
  exports.composeEmptyNode = composeEmptyNode;
  exports.composeNode = composeNode;
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS((exports) => {
  var Document = require_Document();
  var composeNode = require_compose_node();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  function composeDoc(options, directives, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives }, options);
    const doc = new Document.Document(undefined, opts);
    const ctx = {
      atKey: false,
      atRoot: true,
      directives: doc.directives,
      options: doc.options,
      schema: doc.schema
    };
    const props = resolveProps.resolveProps(start, {
      indicator: "doc-start",
      next: value ?? end?.[0],
      offset,
      onError,
      parentIndent: 0,
      startOnNewline: true
    });
    if (props.found) {
      doc.directives.docStart = true;
      if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
        onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
    }
    doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
      doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
  }
  exports.composeDoc = composeDoc;
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS((exports) => {
  var node_process = __require("process");
  var directives = require_directives();
  var Document = require_Document();
  var errors = require_errors();
  var identity = require_identity();
  var composeDoc = require_compose_doc();
  var resolveEnd = require_resolve_end();
  function getErrorPos(src) {
    if (typeof src === "number")
      return [src, src + 1];
    if (Array.isArray(src))
      return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === "string" ? source.length : 1)];
  }
  function parsePrelude(prelude) {
    let comment = "";
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0;i < prelude.length; ++i) {
      const source = prelude[i];
      switch (source[0]) {
        case "#":
          comment += (comment === "" ? "" : afterEmptyLine ? `

` : `
`) + (source.substring(1) || " ");
          atComment = true;
          afterEmptyLine = false;
          break;
        case "%":
          if (prelude[i + 1]?.[0] !== "#")
            i += 1;
          atComment = false;
          break;
        default:
          if (!atComment)
            afterEmptyLine = true;
          atComment = false;
      }
    }
    return { comment, afterEmptyLine };
  }

  class Composer {
    constructor(options = {}) {
      this.doc = null;
      this.atDirectives = false;
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
      this.onError = (source, code, message, warning) => {
        const pos = getErrorPos(source);
        if (warning)
          this.warnings.push(new errors.YAMLWarning(pos, code, message));
        else
          this.errors.push(new errors.YAMLParseError(pos, code, message));
      };
      this.directives = new directives.Directives({ version: options.version || "1.2" });
      this.options = options;
    }
    decorate(doc, afterDoc) {
      const { comment, afterEmptyLine } = parsePrelude(this.prelude);
      if (comment) {
        const dc = doc.contents;
        if (afterDoc) {
          doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
        } else if (afterEmptyLine || doc.directives.docStart || !dc) {
          doc.commentBefore = comment;
        } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
          let it = dc.items[0];
          if (identity.isPair(it))
            it = it.key;
          const cb = it.commentBefore;
          it.commentBefore = cb ? `${comment}
${cb}` : comment;
        } else {
          const cb = dc.commentBefore;
          dc.commentBefore = cb ? `${comment}
${cb}` : comment;
        }
      }
      if (afterDoc) {
        Array.prototype.push.apply(doc.errors, this.errors);
        Array.prototype.push.apply(doc.warnings, this.warnings);
      } else {
        doc.errors = this.errors;
        doc.warnings = this.warnings;
      }
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
    }
    streamInfo() {
      return {
        comment: parsePrelude(this.prelude).comment,
        directives: this.directives,
        errors: this.errors,
        warnings: this.warnings
      };
    }
    *compose(tokens, forceDoc = false, endOffset = -1) {
      for (const token of tokens)
        yield* this.next(token);
      yield* this.end(forceDoc, endOffset);
    }
    *next(token) {
      if (node_process.env.LOG_STREAM)
        console.dir(token, { depth: null });
      switch (token.type) {
        case "directive":
          this.directives.add(token.source, (offset, message, warning) => {
            const pos = getErrorPos(token);
            pos[0] += offset;
            this.onError(pos, "BAD_DIRECTIVE", message, warning);
          });
          this.prelude.push(token.source);
          this.atDirectives = true;
          break;
        case "document": {
          const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
          if (this.atDirectives && !doc.directives.docStart)
            this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
          this.decorate(doc, false);
          if (this.doc)
            yield this.doc;
          this.doc = doc;
          this.atDirectives = false;
          break;
        }
        case "byte-order-mark":
        case "space":
          break;
        case "comment":
        case "newline":
          this.prelude.push(token.source);
          break;
        case "error": {
          const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
          const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
          if (this.atDirectives || !this.doc)
            this.errors.push(error);
          else
            this.doc.errors.push(error);
          break;
        }
        case "doc-end": {
          if (!this.doc) {
            const msg = "Unexpected doc-end without preceding document";
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
            break;
          }
          this.doc.directives.docEnd = true;
          const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
          this.decorate(this.doc, true);
          if (end.comment) {
            const dc = this.doc.comment;
            this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
          }
          this.doc.range[2] = end.offset;
          break;
        }
        default:
          this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
      }
    }
    *end(forceDoc = false, endOffset = -1) {
      if (this.doc) {
        this.decorate(this.doc, true);
        yield this.doc;
        this.doc = null;
      } else if (forceDoc) {
        const opts = Object.assign({ _directives: this.directives }, this.options);
        const doc = new Document.Document(undefined, opts);
        if (this.atDirectives)
          this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
        doc.range = [0, endOffset, endOffset];
        this.decorate(doc, false);
        yield doc;
      }
    }
  }
  exports.Composer = Composer;
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS((exports) => {
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  var errors = require_errors();
  var stringifyString = require_stringifyString();
  function resolveAsScalar(token, strict = true, onError) {
    if (token) {
      const _onError = (pos, code, message) => {
        const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
        if (onError)
          onError(offset, code, message);
        else
          throw new errors.YAMLParseError([offset, offset + 1], code, message);
      };
      switch (token.type) {
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
        case "block-scalar":
          return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
      }
    }
    return null;
  }
  function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey,
      indent: indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
      { type: "newline", offset: -1, indent, source: `
` }
    ];
    switch (source[0]) {
      case "|":
      case ">": {
        const he = source.indexOf(`
`);
        const head = source.substring(0, he);
        const body = source.substring(he + 1) + `
`;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, end))
          props.push({ type: "newline", offset: -1, indent, source: `
` });
        return { type: "block-scalar", offset, indent, props, source: body };
      }
      case '"':
        return { type: "double-quoted-scalar", offset, indent, source, end };
      case "'":
        return { type: "single-quoted-scalar", offset, indent, source, end };
      default:
        return { type: "scalar", offset, indent, source, end };
    }
  }
  function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = "indent" in token ? token.indent : null;
    if (afterKey && typeof indent === "number")
      indent += 2;
    if (!type)
      switch (token.type) {
        case "single-quoted-scalar":
          type = "QUOTE_SINGLE";
          break;
        case "double-quoted-scalar":
          type = "QUOTE_DOUBLE";
          break;
        case "block-scalar": {
          const header = token.props[0];
          if (header.type !== "block-scalar-header")
            throw new Error("Invalid block scalar header");
          type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
          break;
        }
        default:
          type = "PLAIN";
      }
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey: implicitKey || indent === null,
      indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
      case "|":
      case ">":
        setBlockScalarValue(token, source);
        break;
      case '"':
        setFlowScalarValue(token, source, "double-quoted-scalar");
        break;
      case "'":
        setFlowScalarValue(token, source, "single-quoted-scalar");
        break;
      default:
        setFlowScalarValue(token, source, "scalar");
    }
  }
  function setBlockScalarValue(token, source) {
    const he = source.indexOf(`
`);
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + `
`;
    if (token.type === "block-scalar") {
      const header = token.props[0];
      if (header.type !== "block-scalar-header")
        throw new Error("Invalid block scalar header");
      header.source = head;
      token.source = body;
    } else {
      const { offset } = token;
      const indent = "indent" in token ? token.indent : -1;
      const props = [
        { type: "block-scalar-header", offset, indent, source: head }
      ];
      if (!addEndtoBlockProps(props, "end" in token ? token.end : undefined))
        props.push({ type: "newline", offset: -1, indent, source: `
` });
      for (const key of Object.keys(token))
        if (key !== "type" && key !== "offset")
          delete token[key];
      Object.assign(token, { type: "block-scalar", indent, props, source: body });
    }
  }
  function addEndtoBlockProps(props, end) {
    if (end)
      for (const st of end)
        switch (st.type) {
          case "space":
          case "comment":
            props.push(st);
            break;
          case "newline":
            props.push(st);
            return true;
        }
    return false;
  }
  function setFlowScalarValue(token, source, type) {
    switch (token.type) {
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        token.type = type;
        token.source = source;
        break;
      case "block-scalar": {
        const end = token.props.slice(1);
        let oa = source.length;
        if (token.props[0].type === "block-scalar-header")
          oa -= token.props[0].source.length;
        for (const tok of end)
          tok.offset += oa;
        delete token.props;
        Object.assign(token, { type, source, end });
        break;
      }
      case "block-map":
      case "block-seq": {
        const offset = token.offset + source.length;
        const nl = { type: "newline", offset, indent: token.indent, source: `
` };
        delete token.items;
        Object.assign(token, { type, source, end: [nl] });
        break;
      }
      default: {
        const indent = "indent" in token ? token.indent : -1;
        const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type, indent, source, end });
      }
    }
  }
  exports.createScalarToken = createScalarToken;
  exports.resolveAsScalar = resolveAsScalar;
  exports.setScalarValue = setScalarValue;
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS((exports) => {
  var stringify = (cst) => ("type" in cst) ? stringifyToken(cst) : stringifyItem(cst);
  function stringifyToken(token) {
    switch (token.type) {
      case "block-scalar": {
        let res = "";
        for (const tok of token.props)
          res += stringifyToken(tok);
        return res + token.source;
      }
      case "block-map":
      case "block-seq": {
        let res = "";
        for (const item of token.items)
          res += stringifyItem(item);
        return res;
      }
      case "flow-collection": {
        let res = token.start.source;
        for (const item of token.items)
          res += stringifyItem(item);
        for (const st of token.end)
          res += st.source;
        return res;
      }
      case "document": {
        let res = stringifyItem(token);
        if (token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
      default: {
        let res = token.source;
        if ("end" in token && token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
    }
  }
  function stringifyItem({ start, key, sep, value }) {
    let res = "";
    for (const st of start)
      res += st.source;
    if (key)
      res += stringifyToken(key);
    if (sep)
      for (const st of sep)
        res += st.source;
    if (value)
      res += stringifyToken(value);
    return res;
  }
  exports.stringify = stringify;
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS((exports) => {
  var BREAK = Symbol("break visit");
  var SKIP = Symbol("skip children");
  var REMOVE = Symbol("remove item");
  function visit(cst, visitor) {
    if ("type" in cst && cst.type === "document")
      cst = { start: cst.start, value: cst.value };
    _visit(Object.freeze([]), cst, visitor);
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP;
  visit.REMOVE = REMOVE;
  visit.itemAtPath = (cst, path) => {
    let item = cst;
    for (const [field, index] of path) {
      const tok = item?.[field];
      if (tok && "items" in tok) {
        item = tok.items[index];
      } else
        return;
    }
    return item;
  };
  visit.parentCollection = (cst, path) => {
    const parent = visit.itemAtPath(cst, path.slice(0, -1));
    const field = path[path.length - 1][0];
    const coll = parent?.[field];
    if (coll && "items" in coll)
      return coll;
    throw new Error("Parent collection not found");
  };
  function _visit(path, item, visitor) {
    let ctrl = visitor(item, path);
    if (typeof ctrl === "symbol")
      return ctrl;
    for (const field of ["key", "value"]) {
      const token = item[field];
      if (token && "items" in token) {
        for (let i = 0;i < token.items.length; ++i) {
          const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            token.items.splice(i, 1);
            i -= 1;
          }
        }
        if (typeof ctrl === "function" && field === "key")
          ctrl = ctrl(item, path);
      }
    }
    return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
  }
  exports.visit = visit;
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS((exports) => {
  var cstScalar = require_cst_scalar();
  var cstStringify = require_cst_stringify();
  var cstVisit = require_cst_visit();
  var BOM = "\uFEFF";
  var DOCUMENT = "\x02";
  var FLOW_END = "\x18";
  var SCALAR = "\x1F";
  var isCollection = (token) => !!token && ("items" in token);
  var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
  function prettyToken(token) {
    switch (token) {
      case BOM:
        return "<BOM>";
      case DOCUMENT:
        return "<DOC>";
      case FLOW_END:
        return "<FLOW_END>";
      case SCALAR:
        return "<SCALAR>";
      default:
        return JSON.stringify(token);
    }
  }
  function tokenType(source) {
    switch (source) {
      case BOM:
        return "byte-order-mark";
      case DOCUMENT:
        return "doc-mode";
      case FLOW_END:
        return "flow-error-end";
      case SCALAR:
        return "scalar";
      case "---":
        return "doc-start";
      case "...":
        return "doc-end";
      case "":
      case `
`:
      case `\r
`:
        return "newline";
      case "-":
        return "seq-item-ind";
      case "?":
        return "explicit-key-ind";
      case ":":
        return "map-value-ind";
      case "{":
        return "flow-map-start";
      case "}":
        return "flow-map-end";
      case "[":
        return "flow-seq-start";
      case "]":
        return "flow-seq-end";
      case ",":
        return "comma";
    }
    switch (source[0]) {
      case " ":
      case "\t":
        return "space";
      case "#":
        return "comment";
      case "%":
        return "directive-line";
      case "*":
        return "alias";
      case "&":
        return "anchor";
      case "!":
        return "tag";
      case "'":
        return "single-quoted-scalar";
      case '"':
        return "double-quoted-scalar";
      case "|":
      case ">":
        return "block-scalar-header";
    }
    return null;
  }
  exports.createScalarToken = cstScalar.createScalarToken;
  exports.resolveAsScalar = cstScalar.resolveAsScalar;
  exports.setScalarValue = cstScalar.setScalarValue;
  exports.stringify = cstStringify.stringify;
  exports.visit = cstVisit.visit;
  exports.BOM = BOM;
  exports.DOCUMENT = DOCUMENT;
  exports.FLOW_END = FLOW_END;
  exports.SCALAR = SCALAR;
  exports.isCollection = isCollection;
  exports.isScalar = isScalar;
  exports.prettyToken = prettyToken;
  exports.tokenType = tokenType;
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS((exports) => {
  var cst = require_cst();
  function isEmpty(ch) {
    switch (ch) {
      case undefined:
      case " ":
      case `
`:
      case "\r":
      case "\t":
        return true;
      default:
        return false;
    }
  }
  var hexDigits = new Set("0123456789ABCDEFabcdef");
  var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
  var flowIndicatorChars = new Set(",[]{}");
  var invalidAnchorChars = new Set(` ,[]{}
\r	`);
  var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);

  class Lexer {
    constructor() {
      this.atEnd = false;
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      this.buffer = "";
      this.flowKey = false;
      this.flowLevel = 0;
      this.indentNext = 0;
      this.indentValue = 0;
      this.lineEndPos = null;
      this.next = null;
      this.pos = 0;
    }
    *lex(source, incomplete = false) {
      if (source) {
        if (typeof source !== "string")
          throw TypeError("source is not a string");
        this.buffer = this.buffer ? this.buffer + source : source;
        this.lineEndPos = null;
      }
      this.atEnd = !incomplete;
      let next = this.next ?? "stream";
      while (next && (incomplete || this.hasChars(1)))
        next = yield* this.parseNext(next);
    }
    atLineEnd() {
      let i = this.pos;
      let ch = this.buffer[i];
      while (ch === " " || ch === "\t")
        ch = this.buffer[++i];
      if (!ch || ch === "#" || ch === `
`)
        return true;
      if (ch === "\r")
        return this.buffer[i + 1] === `
`;
      return false;
    }
    charAt(n) {
      return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
      let ch = this.buffer[offset];
      if (this.indentNext > 0) {
        let indent = 0;
        while (ch === " ")
          ch = this.buffer[++indent + offset];
        if (ch === "\r") {
          const next = this.buffer[indent + offset + 1];
          if (next === `
` || !next && !this.atEnd)
            return offset + indent + 1;
        }
        return ch === `
` || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
      }
      if (ch === "-" || ch === ".") {
        const dt = this.buffer.substr(offset, 3);
        if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
          return -1;
      }
      return offset;
    }
    getLine() {
      let end = this.lineEndPos;
      if (typeof end !== "number" || end !== -1 && end < this.pos) {
        end = this.buffer.indexOf(`
`, this.pos);
        this.lineEndPos = end;
      }
      if (end === -1)
        return this.atEnd ? this.buffer.substring(this.pos) : null;
      if (this.buffer[end - 1] === "\r")
        end -= 1;
      return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
      return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
      this.buffer = this.buffer.substring(this.pos);
      this.pos = 0;
      this.lineEndPos = null;
      this.next = state;
      return null;
    }
    peek(n) {
      return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
      switch (next) {
        case "stream":
          return yield* this.parseStream();
        case "line-start":
          return yield* this.parseLineStart();
        case "block-start":
          return yield* this.parseBlockStart();
        case "doc":
          return yield* this.parseDocument();
        case "flow":
          return yield* this.parseFlowCollection();
        case "quoted-scalar":
          return yield* this.parseQuotedScalar();
        case "block-scalar":
          return yield* this.parseBlockScalar();
        case "plain-scalar":
          return yield* this.parsePlainScalar();
      }
    }
    *parseStream() {
      let line = this.getLine();
      if (line === null)
        return this.setNext("stream");
      if (line[0] === cst.BOM) {
        yield* this.pushCount(1);
        line = line.substring(1);
      }
      if (line[0] === "%") {
        let dirEnd = line.length;
        let cs = line.indexOf("#");
        while (cs !== -1) {
          const ch = line[cs - 1];
          if (ch === " " || ch === "\t") {
            dirEnd = cs - 1;
            break;
          } else {
            cs = line.indexOf("#", cs + 1);
          }
        }
        while (true) {
          const ch = line[dirEnd - 1];
          if (ch === " " || ch === "\t")
            dirEnd -= 1;
          else
            break;
        }
        const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
        yield* this.pushCount(line.length - n);
        this.pushNewline();
        return "stream";
      }
      if (this.atLineEnd()) {
        const sp = yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - sp);
        yield* this.pushNewline();
        return "stream";
      }
      yield cst.DOCUMENT;
      return yield* this.parseLineStart();
    }
    *parseLineStart() {
      const ch = this.charAt(0);
      if (!ch && !this.atEnd)
        return this.setNext("line-start");
      if (ch === "-" || ch === ".") {
        if (!this.atEnd && !this.hasChars(4))
          return this.setNext("line-start");
        const s = this.peek(3);
        if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
          yield* this.pushCount(3);
          this.indentValue = 0;
          this.indentNext = 0;
          return s === "---" ? "doc" : "stream";
        }
      }
      this.indentValue = yield* this.pushSpaces(false);
      if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
        this.indentNext = this.indentValue;
      return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
      const [ch0, ch1] = this.peek(2);
      if (!ch1 && !this.atEnd)
        return this.setNext("block-start");
      if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
        const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
        this.indentNext = this.indentValue + 1;
        this.indentValue += n;
        return yield* this.parseBlockStart();
      }
      return "doc";
    }
    *parseDocument() {
      yield* this.pushSpaces(true);
      const line = this.getLine();
      if (line === null)
        return this.setNext("doc");
      let n = yield* this.pushIndicators();
      switch (line[n]) {
        case "#":
          yield* this.pushCount(line.length - n);
        case undefined:
          yield* this.pushNewline();
          return yield* this.parseLineStart();
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel = 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          return "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "doc";
        case '"':
        case "'":
          return yield* this.parseQuotedScalar();
        case "|":
        case ">":
          n += yield* this.parseBlockScalarHeader();
          n += yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - n);
          yield* this.pushNewline();
          return yield* this.parseBlockScalar();
        default:
          return yield* this.parsePlainScalar();
      }
    }
    *parseFlowCollection() {
      let nl, sp;
      let indent = -1;
      do {
        nl = yield* this.pushNewline();
        if (nl > 0) {
          sp = yield* this.pushSpaces(false);
          this.indentValue = indent = sp;
        } else {
          sp = 0;
        }
        sp += yield* this.pushSpaces(true);
      } while (nl + sp > 0);
      const line = this.getLine();
      if (line === null)
        return this.setNext("flow");
      if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
        const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
        if (!atFlowEndMarker) {
          this.flowLevel = 0;
          yield cst.FLOW_END;
          return yield* this.parseLineStart();
        }
      }
      let n = 0;
      while (line[n] === ",") {
        n += yield* this.pushCount(1);
        n += yield* this.pushSpaces(true);
        this.flowKey = false;
      }
      n += yield* this.pushIndicators();
      switch (line[n]) {
        case undefined:
          return "flow";
        case "#":
          yield* this.pushCount(line.length - n);
          return "flow";
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel += 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          this.flowKey = true;
          this.flowLevel -= 1;
          return this.flowLevel ? "flow" : "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "flow";
        case '"':
        case "'":
          this.flowKey = true;
          return yield* this.parseQuotedScalar();
        case ":": {
          const next = this.charAt(1);
          if (this.flowKey || isEmpty(next) || next === ",") {
            this.flowKey = false;
            yield* this.pushCount(1);
            yield* this.pushSpaces(true);
            return "flow";
          }
        }
        default:
          this.flowKey = false;
          return yield* this.parsePlainScalar();
      }
    }
    *parseQuotedScalar() {
      const quote = this.charAt(0);
      let end = this.buffer.indexOf(quote, this.pos + 1);
      if (quote === "'") {
        while (end !== -1 && this.buffer[end + 1] === "'")
          end = this.buffer.indexOf("'", end + 2);
      } else {
        while (end !== -1) {
          let n = 0;
          while (this.buffer[end - 1 - n] === "\\")
            n += 1;
          if (n % 2 === 0)
            break;
          end = this.buffer.indexOf('"', end + 1);
        }
      }
      const qb = this.buffer.substring(0, end);
      let nl = qb.indexOf(`
`, this.pos);
      if (nl !== -1) {
        while (nl !== -1) {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = qb.indexOf(`
`, cs);
        }
        if (nl !== -1) {
          end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
        }
      }
      if (end === -1) {
        if (!this.atEnd)
          return this.setNext("quoted-scalar");
        end = this.buffer.length;
      }
      yield* this.pushToIndex(end + 1, false);
      return this.flowLevel ? "flow" : "doc";
    }
    *parseBlockScalarHeader() {
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      let i = this.pos;
      while (true) {
        const ch = this.buffer[++i];
        if (ch === "+")
          this.blockScalarKeep = true;
        else if (ch > "0" && ch <= "9")
          this.blockScalarIndent = Number(ch) - 1;
        else if (ch !== "-")
          break;
      }
      return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
    }
    *parseBlockScalar() {
      let nl = this.pos - 1;
      let indent = 0;
      let ch;
      loop:
        for (let i2 = this.pos;ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case `
`:
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === `
`)
                break;
            }
            default:
              break loop;
          }
        }
      if (!ch && !this.atEnd)
        return this.setNext("block-scalar");
      if (indent >= this.indentNext) {
        if (this.blockScalarIndent === -1)
          this.indentNext = indent;
        else {
          this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
        }
        do {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = this.buffer.indexOf(`
`, cs);
        } while (nl !== -1);
        if (nl === -1) {
          if (!this.atEnd)
            return this.setNext("block-scalar");
          nl = this.buffer.length;
        }
      }
      let i = nl + 1;
      ch = this.buffer[i];
      while (ch === " ")
        ch = this.buffer[++i];
      if (ch === "\t") {
        while (ch === "\t" || ch === " " || ch === "\r" || ch === `
`)
          ch = this.buffer[++i];
        nl = i - 1;
      } else if (!this.blockScalarKeep) {
        do {
          let i2 = nl - 1;
          let ch2 = this.buffer[i2];
          if (ch2 === "\r")
            ch2 = this.buffer[--i2];
          const lastChar = i2;
          while (ch2 === " ")
            ch2 = this.buffer[--i2];
          if (ch2 === `
` && i2 >= this.pos && i2 + 1 + indent > lastChar)
            nl = i2;
          else
            break;
        } while (true);
      }
      yield cst.SCALAR;
      yield* this.pushToIndex(nl + 1, true);
      return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
      const inFlow = this.flowLevel > 0;
      let end = this.pos - 1;
      let i = this.pos - 1;
      let ch;
      while (ch = this.buffer[++i]) {
        if (ch === ":") {
          const next = this.buffer[i + 1];
          if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
            break;
          end = i;
        } else if (isEmpty(ch)) {
          let next = this.buffer[i + 1];
          if (ch === "\r") {
            if (next === `
`) {
              i += 1;
              ch = `
`;
              next = this.buffer[i + 1];
            } else
              end = i;
          }
          if (next === "#" || inFlow && flowIndicatorChars.has(next))
            break;
          if (ch === `
`) {
            const cs = this.continueScalar(i + 1);
            if (cs === -1)
              break;
            i = Math.max(i, cs - 2);
          }
        } else {
          if (inFlow && flowIndicatorChars.has(ch))
            break;
          end = i;
        }
      }
      if (!ch && !this.atEnd)
        return this.setNext("plain-scalar");
      yield cst.SCALAR;
      yield* this.pushToIndex(end + 1, true);
      return inFlow ? "flow" : "doc";
    }
    *pushCount(n) {
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos += n;
        return n;
      }
      return 0;
    }
    *pushToIndex(i, allowEmpty) {
      const s = this.buffer.slice(this.pos, i);
      if (s) {
        yield s;
        this.pos += s.length;
        return s.length;
      } else if (allowEmpty)
        yield "";
      return 0;
    }
    *pushIndicators() {
      switch (this.charAt(0)) {
        case "!":
          return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
        case "&":
          return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
        case "-":
        case "?":
        case ":": {
          const inFlow = this.flowLevel > 0;
          const ch1 = this.charAt(1);
          if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
            if (!inFlow)
              this.indentNext = this.indentValue + 1;
            else if (this.flowKey)
              this.flowKey = false;
            return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          }
        }
      }
      return 0;
    }
    *pushTag() {
      if (this.charAt(1) === "<") {
        let i = this.pos + 2;
        let ch = this.buffer[i];
        while (!isEmpty(ch) && ch !== ">")
          ch = this.buffer[++i];
        return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
      } else {
        let i = this.pos + 1;
        let ch = this.buffer[i];
        while (ch) {
          if (tagChars.has(ch))
            ch = this.buffer[++i];
          else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
            ch = this.buffer[i += 3];
          } else
            break;
        }
        return yield* this.pushToIndex(i, false);
      }
    }
    *pushNewline() {
      const ch = this.buffer[this.pos];
      if (ch === `
`)
        return yield* this.pushCount(1);
      else if (ch === "\r" && this.charAt(1) === `
`)
        return yield* this.pushCount(2);
      else
        return 0;
    }
    *pushSpaces(allowTabs) {
      let i = this.pos - 1;
      let ch;
      do {
        ch = this.buffer[++i];
      } while (ch === " " || allowTabs && ch === "\t");
      const n = i - this.pos;
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos = i;
      }
      return n;
    }
    *pushUntil(test) {
      let i = this.pos;
      let ch = this.buffer[i];
      while (!test(ch))
        ch = this.buffer[++i];
      return yield* this.pushToIndex(i, false);
    }
  }
  exports.Lexer = Lexer;
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS((exports) => {
  class LineCounter {
    constructor() {
      this.lineStarts = [];
      this.addNewLine = (offset) => this.lineStarts.push(offset);
      this.linePos = (offset) => {
        let low = 0;
        let high = this.lineStarts.length;
        while (low < high) {
          const mid = low + high >> 1;
          if (this.lineStarts[mid] < offset)
            low = mid + 1;
          else
            high = mid;
        }
        if (this.lineStarts[low] === offset)
          return { line: low + 1, col: 1 };
        if (low === 0)
          return { line: 0, col: offset };
        const start = this.lineStarts[low - 1];
        return { line: low, col: offset - start + 1 };
      };
    }
  }
  exports.LineCounter = LineCounter;
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS((exports) => {
  var node_process = __require("process");
  var cst = require_cst();
  var lexer = require_lexer();
  function includesToken(list, type) {
    for (let i = 0;i < list.length; ++i)
      if (list[i].type === type)
        return true;
    return false;
  }
  function findNonEmptyIndex(list) {
    for (let i = 0;i < list.length; ++i) {
      switch (list[i].type) {
        case "space":
        case "comment":
        case "newline":
          break;
        default:
          return i;
      }
    }
    return -1;
  }
  function isFlowToken(token) {
    switch (token?.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "flow-collection":
        return true;
      default:
        return false;
    }
  }
  function getPrevProps(parent) {
    switch (parent.type) {
      case "document":
        return parent.start;
      case "block-map": {
        const it = parent.items[parent.items.length - 1];
        return it.sep ?? it.start;
      }
      case "block-seq":
        return parent.items[parent.items.length - 1].start;
      default:
        return [];
    }
  }
  function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
      return [];
    let i = prev.length;
    loop:
      while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
    while (prev[++i]?.type === "space") {}
    return prev.splice(i, prev.length);
  }
  function fixFlowSeqItems(fc) {
    if (fc.start.type === "flow-seq-start") {
      for (const it of fc.items) {
        if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
          if (it.key)
            it.value = it.key;
          delete it.key;
          if (isFlowToken(it.value)) {
            if (it.value.end)
              Array.prototype.push.apply(it.value.end, it.sep);
            else
              it.value.end = it.sep;
          } else
            Array.prototype.push.apply(it.start, it.sep);
          delete it.sep;
        }
      }
    }
  }

  class Parser {
    constructor(onNewLine) {
      this.atNewLine = true;
      this.atScalar = false;
      this.indent = 0;
      this.offset = 0;
      this.onKeyLine = false;
      this.stack = [];
      this.source = "";
      this.type = "";
      this.lexer = new lexer.Lexer;
      this.onNewLine = onNewLine;
    }
    *parse(source, incomplete = false) {
      if (this.onNewLine && this.offset === 0)
        this.onNewLine(0);
      for (const lexeme of this.lexer.lex(source, incomplete))
        yield* this.next(lexeme);
      if (!incomplete)
        yield* this.end();
    }
    *next(source) {
      this.source = source;
      if (node_process.env.LOG_TOKENS)
        console.log("|", cst.prettyToken(source));
      if (this.atScalar) {
        this.atScalar = false;
        yield* this.step();
        this.offset += source.length;
        return;
      }
      const type = cst.tokenType(source);
      if (!type) {
        const message = `Not a YAML token: ${source}`;
        yield* this.pop({ type: "error", offset: this.offset, message, source });
        this.offset += source.length;
      } else if (type === "scalar") {
        this.atNewLine = false;
        this.atScalar = true;
        this.type = "scalar";
      } else {
        this.type = type;
        yield* this.step();
        switch (type) {
          case "newline":
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine)
              this.onNewLine(this.offset + source.length);
            break;
          case "space":
            if (this.atNewLine && source[0] === " ")
              this.indent += source.length;
            break;
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
            if (this.atNewLine)
              this.indent += source.length;
            break;
          case "doc-mode":
          case "flow-error-end":
            return;
          default:
            this.atNewLine = false;
        }
        this.offset += source.length;
      }
    }
    *end() {
      while (this.stack.length > 0)
        yield* this.pop();
    }
    get sourceToken() {
      const st = {
        type: this.type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
      return st;
    }
    *step() {
      const top = this.peek(1);
      if (this.type === "doc-end" && top?.type !== "doc-end") {
        while (this.stack.length > 0)
          yield* this.pop();
        this.stack.push({
          type: "doc-end",
          offset: this.offset,
          source: this.source
        });
        return;
      }
      if (!top)
        return yield* this.stream();
      switch (top.type) {
        case "document":
          return yield* this.document(top);
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return yield* this.scalar(top);
        case "block-scalar":
          return yield* this.blockScalar(top);
        case "block-map":
          return yield* this.blockMap(top);
        case "block-seq":
          return yield* this.blockSequence(top);
        case "flow-collection":
          return yield* this.flowCollection(top);
        case "doc-end":
          return yield* this.documentEnd(top);
      }
      yield* this.pop();
    }
    peek(n) {
      return this.stack[this.stack.length - n];
    }
    *pop(error) {
      const token = error ?? this.stack.pop();
      if (!token) {
        const message = "Tried to pop an empty stack";
        yield { type: "error", offset: this.offset, source: "", message };
      } else if (this.stack.length === 0) {
        yield token;
      } else {
        const top = this.peek(1);
        if (token.type === "block-scalar") {
          token.indent = "indent" in top ? top.indent : 0;
        } else if (token.type === "flow-collection" && top.type === "document") {
          token.indent = 0;
        }
        if (token.type === "flow-collection")
          fixFlowSeqItems(token);
        switch (top.type) {
          case "document":
            top.value = token;
            break;
          case "block-scalar":
            top.props.push(token);
            break;
          case "block-map": {
            const it = top.items[top.items.length - 1];
            if (it.value) {
              top.items.push({ start: [], key: token, sep: [] });
              this.onKeyLine = true;
              return;
            } else if (it.sep) {
              it.value = token;
            } else {
              Object.assign(it, { key: token, sep: [] });
              this.onKeyLine = !it.explicitKey;
              return;
            }
            break;
          }
          case "block-seq": {
            const it = top.items[top.items.length - 1];
            if (it.value)
              top.items.push({ start: [], value: token });
            else
              it.value = token;
            break;
          }
          case "flow-collection": {
            const it = top.items[top.items.length - 1];
            if (!it || it.value)
              top.items.push({ start: [], key: token, sep: [] });
            else if (it.sep)
              it.value = token;
            else
              Object.assign(it, { key: token, sep: [] });
            return;
          }
          default:
            yield* this.pop();
            yield* this.pop(token);
        }
        if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
          const last = token.items[token.items.length - 1];
          if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
            if (top.type === "document")
              top.end = last.start;
            else
              top.items.push({ start: last.start });
            token.items.splice(-1, 1);
          }
        }
      }
    }
    *stream() {
      switch (this.type) {
        case "directive-line":
          yield { type: "directive", offset: this.offset, source: this.source };
          return;
        case "byte-order-mark":
        case "space":
        case "comment":
        case "newline":
          yield this.sourceToken;
          return;
        case "doc-mode":
        case "doc-start": {
          const doc = {
            type: "document",
            offset: this.offset,
            start: []
          };
          if (this.type === "doc-start")
            doc.start.push(this.sourceToken);
          this.stack.push(doc);
          return;
        }
      }
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML stream`,
        source: this.source
      };
    }
    *document(doc) {
      if (doc.value)
        return yield* this.lineEnd(doc);
      switch (this.type) {
        case "doc-start": {
          if (findNonEmptyIndex(doc.start) !== -1) {
            yield* this.pop();
            yield* this.step();
          } else
            doc.start.push(this.sourceToken);
          return;
        }
        case "anchor":
        case "tag":
        case "space":
        case "comment":
        case "newline":
          doc.start.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(doc);
      if (bv)
        this.stack.push(bv);
      else {
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source
        };
      }
    }
    *scalar(scalar) {
      if (this.type === "map-value-ind") {
        const prev = getPrevProps(this.peek(2));
        const start = getFirstKeyStartProps(prev);
        let sep;
        if (scalar.end) {
          sep = scalar.end;
          sep.push(this.sourceToken);
          delete scalar.end;
        } else
          sep = [this.sourceToken];
        const map = {
          type: "block-map",
          offset: scalar.offset,
          indent: scalar.indent,
          items: [{ start, key: scalar, sep }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map;
      } else
        yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
      switch (this.type) {
        case "space":
        case "comment":
        case "newline":
          scalar.props.push(this.sourceToken);
          return;
        case "scalar":
          scalar.source = this.source;
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine) {
            let nl = this.source.indexOf(`
`) + 1;
            while (nl !== 0) {
              this.onNewLine(this.offset + nl);
              nl = this.source.indexOf(`
`, nl) + 1;
            }
          }
          yield* this.pop();
          break;
        default:
          yield* this.pop();
          yield* this.step();
      }
    }
    *blockMap(map) {
      const it = map.items[map.items.length - 1];
      switch (this.type) {
        case "newline":
          this.onKeyLine = false;
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "space":
        case "comment":
          if (it.value) {
            map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            if (this.atIndentedComment(it.start, map.indent)) {
              const prev = map.items[map.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                Array.prototype.push.apply(end, it.start);
                end.push(this.sourceToken);
                map.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
      }
      if (this.indent >= map.indent) {
        const atMapIndent = !this.onKeyLine && this.indent === map.indent;
        const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
        let start = [];
        if (atNextItem && it.sep && !it.value) {
          const nl = [];
          for (let i = 0;i < it.sep.length; ++i) {
            const st = it.sep[i];
            switch (st.type) {
              case "newline":
                nl.push(i);
                break;
              case "space":
                break;
              case "comment":
                if (st.indent > map.indent)
                  nl.length = 0;
                break;
              default:
                nl.length = 0;
            }
          }
          if (nl.length >= 2)
            start = it.sep.splice(nl[1]);
        }
        switch (this.type) {
          case "anchor":
          case "tag":
            if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start });
              this.onKeyLine = true;
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "explicit-key-ind":
            if (!it.sep && !it.explicitKey) {
              it.start.push(this.sourceToken);
              it.explicitKey = true;
            } else if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start, explicitKey: true });
            } else {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [this.sourceToken], explicitKey: true }]
              });
            }
            this.onKeyLine = true;
            return;
          case "map-value-ind":
            if (it.explicitKey) {
              if (!it.sep) {
                if (includesToken(it.start, "newline")) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else {
                  const start2 = getFirstKeyStartProps(it.start);
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                  });
                }
              } else if (it.value) {
                map.items.push({ start: [], key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start, key: null, sep: [this.sourceToken] }]
                });
              } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                const start2 = getFirstKeyStartProps(it.start);
                const key = it.key;
                const sep = it.sep;
                sep.push(this.sourceToken);
                delete it.key;
                delete it.sep;
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key, sep }]
                });
              } else if (start.length > 0) {
                it.sep = it.sep.concat(start, this.sourceToken);
              } else {
                it.sep.push(this.sourceToken);
              }
            } else {
              if (!it.sep) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else if (it.value || atNextItem) {
                map.items.push({ start, key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [], key: null, sep: [this.sourceToken] }]
                });
              } else {
                it.sep.push(this.sourceToken);
              }
            }
            this.onKeyLine = true;
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (atNextItem || it.value) {
              map.items.push({ start, key: fs, sep: [] });
              this.onKeyLine = true;
            } else if (it.sep) {
              this.stack.push(fs);
            } else {
              Object.assign(it, { key: fs, sep: [] });
              this.onKeyLine = true;
            }
            return;
          }
          default: {
            const bv = this.startBlockValue(map);
            if (bv) {
              if (bv.type === "block-seq") {
                if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                  yield* this.pop({
                    type: "error",
                    offset: this.offset,
                    message: "Unexpected block-seq-ind on same line with key",
                    source: this.source
                  });
                  return;
                }
              } else if (atMapIndent) {
                map.items.push({ start });
              }
              this.stack.push(bv);
              return;
            }
          }
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *blockSequence(seq) {
      const it = seq.items[seq.items.length - 1];
      switch (this.type) {
        case "newline":
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              seq.items.push({ start: [this.sourceToken] });
          } else
            it.start.push(this.sourceToken);
          return;
        case "space":
        case "comment":
          if (it.value)
            seq.items.push({ start: [this.sourceToken] });
          else {
            if (this.atIndentedComment(it.start, seq.indent)) {
              const prev = seq.items[seq.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                Array.prototype.push.apply(end, it.start);
                end.push(this.sourceToken);
                seq.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
        case "anchor":
        case "tag":
          if (it.value || this.indent <= seq.indent)
            break;
          it.start.push(this.sourceToken);
          return;
        case "seq-item-ind":
          if (this.indent !== seq.indent)
            break;
          if (it.value || includesToken(it.start, "seq-item-ind"))
            seq.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
      }
      if (this.indent > seq.indent) {
        const bv = this.startBlockValue(seq);
        if (bv) {
          this.stack.push(bv);
          return;
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *flowCollection(fc) {
      const it = fc.items[fc.items.length - 1];
      if (this.type === "flow-error-end") {
        let top;
        do {
          yield* this.pop();
          top = this.peek(1);
        } while (top?.type === "flow-collection");
      } else if (fc.end.length === 0) {
        switch (this.type) {
          case "comma":
          case "explicit-key-ind":
            if (!it || it.sep)
              fc.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
          case "map-value-ind":
            if (!it || it.value)
              fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            return;
          case "space":
          case "comment":
          case "newline":
          case "anchor":
          case "tag":
            if (!it || it.value)
              fc.items.push({ start: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              it.start.push(this.sourceToken);
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (!it || it.value)
              fc.items.push({ start: [], key: fs, sep: [] });
            else if (it.sep)
              this.stack.push(fs);
            else
              Object.assign(it, { key: fs, sep: [] });
            return;
          }
          case "flow-map-end":
          case "flow-seq-end":
            fc.end.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(fc);
        if (bv)
          this.stack.push(bv);
        else {
          yield* this.pop();
          yield* this.step();
        }
      } else {
        const parent = this.peek(2);
        if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
          yield* this.pop();
          yield* this.step();
        } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          fixFlowSeqItems(fc);
          const sep = fc.end.splice(1, fc.end.length);
          sep.push(this.sourceToken);
          const map = {
            type: "block-map",
            offset: fc.offset,
            indent: fc.indent,
            items: [{ start, key: fc, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else {
          yield* this.lineEnd(fc);
        }
      }
    }
    flowScalar(type) {
      if (this.onNewLine) {
        let nl = this.source.indexOf(`
`) + 1;
        while (nl !== 0) {
          this.onNewLine(this.offset + nl);
          nl = this.source.indexOf(`
`, nl) + 1;
        }
      }
      return {
        type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
    }
    startBlockValue(parent) {
      switch (this.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return this.flowScalar(this.type);
        case "block-scalar-header":
          return {
            type: "block-scalar",
            offset: this.offset,
            indent: this.indent,
            props: [this.sourceToken],
            source: ""
          };
        case "flow-map-start":
        case "flow-seq-start":
          return {
            type: "flow-collection",
            offset: this.offset,
            indent: this.indent,
            start: this.sourceToken,
            items: [],
            end: []
          };
        case "seq-item-ind":
          return {
            type: "block-seq",
            offset: this.offset,
            indent: this.indent,
            items: [{ start: [this.sourceToken] }]
          };
        case "explicit-key-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          start.push(this.sourceToken);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, explicitKey: true }]
          };
        }
        case "map-value-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, key: null, sep: [this.sourceToken] }]
          };
        }
      }
      return null;
    }
    atIndentedComment(start, indent) {
      if (this.type !== "comment")
        return false;
      if (this.indent <= indent)
        return false;
      return start.every((st) => st.type === "newline" || st.type === "space");
    }
    *documentEnd(docEnd) {
      if (this.type !== "doc-mode") {
        if (docEnd.end)
          docEnd.end.push(this.sourceToken);
        else
          docEnd.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
      }
    }
    *lineEnd(token) {
      switch (this.type) {
        case "comma":
        case "doc-start":
        case "doc-end":
        case "flow-seq-end":
        case "flow-map-end":
        case "map-value-ind":
          yield* this.pop();
          yield* this.step();
          break;
        case "newline":
          this.onKeyLine = false;
        case "space":
        case "comment":
        default:
          if (token.end)
            token.end.push(this.sourceToken);
          else
            token.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
      }
    }
  }
  exports.Parser = Parser;
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS((exports) => {
  var composer = require_composer();
  var Document = require_Document();
  var errors = require_errors();
  var log = require_log();
  var identity = require_identity();
  var lineCounter = require_line_counter();
  var parser = require_parser();
  function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter || null;
    return { lineCounter: lineCounter$1, prettyErrors };
  }
  function parseAllDocuments(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter2)
      for (const doc of docs) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
    if (docs.length > 0)
      return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
  }
  function parseDocument(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
      if (!doc)
        doc = _doc;
      else if (doc.options.logLevel !== "silent") {
        doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
        break;
      }
    }
    if (prettyErrors && lineCounter2) {
      doc.errors.forEach(errors.prettifyError(source, lineCounter2));
      doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
    }
    return doc;
  }
  function parse(src, reviver, options) {
    let _reviver = undefined;
    if (typeof reviver === "function") {
      _reviver = reviver;
    } else if (options === undefined && reviver && typeof reviver === "object") {
      options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
      return null;
    doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
      if (doc.options.logLevel !== "silent")
        throw doc.errors[0];
      else
        doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
  }
  function stringify(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === undefined && replacer) {
      options = replacer;
    }
    if (typeof options === "string")
      options = options.length;
    if (typeof options === "number") {
      const indent = Math.round(options);
      options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === undefined) {
      const { keepUndefined } = options ?? replacer ?? {};
      if (!keepUndefined)
        return;
    }
    if (identity.isDocument(value) && !_replacer)
      return value.toString(options);
    return new Document.Document(value, _replacer, options).toString(options);
  }
  exports.parse = parse;
  exports.parseAllDocuments = parseAllDocuments;
  exports.parseDocument = parseDocument;
  exports.stringify = stringify;
});
// tracker-card-templates/bento-style-tracker.json
var bento_style_tracker_default = {
  templateName: "Bento Style Tracker",
  templateAuthor: "Prolix OCs",
  templatePosition: "BOTTOM",
  htmlTemplate: `<!-- TEMPLATE NAME: Bento Style Tracker -->
<!-- AUTHOR: Prolix OCs -->
<!-- POSITION: BOTTOM -->

<!-- CARD_TEMPLATE_START -->
<style>
    /* =========================================
       BENTO GRID INTEGRATION
       ========================================= */
    /* Target the SimTracker container to enforce grid layout */
    #silly-sim-tracker-container {
        display: flex;
        flex-wrap: wrap; 
        justify-content: center;
        gap: 20px;
        align-items: flex-start; /* Independent Height Scaling */
        width: 100%;
        max-width: 960px;
        margin: 0 auto;
        padding: 20px 0;
    }

    /* =========================================
       GLOBAL THEME VARIABLES (Scoped)
       ========================================= */
    .bento-card {
        --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --glass-surface: rgba(30, 30, 35, 0.70);
        --glass-border: rgba(255, 255, 255, 0.12);
        --glass-blur: 40px;
        --shadow-float: 0 20px 50px -10px rgba(0, 0, 0, 0.6);

        --text-primary: #ffffff;
        --text-secondary: #9898a0;
        
        /* FIXED GRADIENTS */
        --grad-aff: linear-gradient(90deg, #ff9a9e 0%, #fad0c4 50%, #fbc2eb 100%);
        --grad-des: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
        --grad-tru: linear-gradient(90deg, #43e97b 0%, #38f9d7 100%);
        --grad-con: linear-gradient(90deg, #cfd9df 0%, #e2ebf0 100%);

        /* REACTION COLORS */
        --st-approved: #2ecc71;    --bg-approved: rgba(46, 204, 113, 0.15);
        --st-neutral: #f1c40f;     --bg-neutral: rgba(241, 196, 15, 0.15);
        --st-disapproved: #e74c3c; --bg-disapproved: rgba(231, 76, 60, 0.15);
        
        /* CYCLE COLORS */
        --cy-preg: #f6d365;      --bg-preg: rgba(246, 211, 101, 0.15);
        --cy-ovu: #00d2ff;       --bg-ovu: rgba(0, 210, 255, 0.15);
        --cy-men: #ff5e62;       --bg-men: rgba(255, 94, 98, 0.15);
        --cy-rut: #9b59b6;       --bg-rut: rgba(155, 89, 182, 0.15);
    }

    /* =========================================
       BENTO CARD STYLES
       ========================================= */
    .bento-card {
        flex: 1 1 340px; 
        max-width: 460px; 
        min-width: 300px;
        background: var(--glass-surface);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        border: 1px solid var(--glass-border);
        border-radius: 24px;
        box-shadow: var(--shadow-float);
        overflow: hidden;
        transition: border-color 0.3s ease, opacity 0.3s ease;
        position: relative;
        height: auto;
        box-sizing: border-box;
        font-family: var(--font-stack);
        color: var(--text-primary);
    }

    .bento-card:hover { border-color: rgba(255,255,255,0.3); }
    
    .bento-card.inactive { opacity: 0.6; }

    .bento-card * { box-sizing: border-box; }

    /* SVG Helpers */
    .bento-card svg { display: block; }
    .bento-card .icon-sm { width: 14px; height: 14px; }
    .bento-card .icon-md { width: 18px; height: 18px; }

    /* Toggle Logic */
    .bento-card input[type="checkbox"].toggle { position: absolute; opacity: 0; pointer-events: none; }

    /* HEADER */
    .bento-header {
        padding: 20px 24px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
    }

    .identity-group { display: flex; align-items: center; gap: 16px; }
    .bento-avatar {
        width: 44px !important; 
        height: 44px !important;
        min-width: 44px !important;
        min-height: 44px !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
        display: flex !important; 
        align-items: center !important; 
        justify-content: center !important;
        font-size: 1.4rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        overflow: hidden;
        color: #fff;
        font-weight: bold;
        text-transform: uppercase;
        line-height: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    .text-group { display: flex; flex-direction: column; }
    .text-group h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.5px; margin: 0 0 2px 0; }
    .text-group .date { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }

    .chevron { opacity: 0.5; transition: transform 0.4s ease; color: #fff; will-change: transform; transform: translateZ(0); }
    .bento-card input.toggle:checked + .bento-header .chevron { transform: rotate(180deg); opacity: 1; }
    
    .header-badges { display: flex; gap: 8px; margin-right: 12px; }
    .mini-badge { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }

    /* BODY */
    .bento-body-wrapper {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        will-change: grid-template-rows;
    }
    .bento-card input.toggle:checked ~ .bento-body-wrapper { grid-template-rows: 1fr; }

    .bento-inner {
        overflow: hidden;
        padding: 0 24px 24px 24px;
        opacity: 0;
        transform: translate3d(0, -10px, 0);
        transition: opacity 0.3s ease, transform 0.3s ease;
        will-change: opacity, transform;
    }
    .bento-card input.toggle:checked ~ .bento-body-wrapper .bento-inner {
        opacity: 1; transform: translate3d(0, 0, 0); transition-delay: 0.1s;
    }

    /* MONOLOGUE */
    .monologue-dark {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        padding: 34px 16px 16px 16px; 
        margin-bottom: 20px;
        position: relative;
        min-height: 90px; 
        height: auto; 
    }

    .monologue-dark p { font-style: italic; color: #e0e0e0; font-size: 0.9rem; line-height: 1.5; margin: 0; }
    .mono-tag { 
        position: absolute; top: 10px; left: 16px; background: #222; 
        padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; 
        text-transform: uppercase; font-weight: 800; color: #777;
        letter-spacing: 0.5px; border: 1px solid rgba(255,255,255,0.1);
    }

    /* STATUS ROW */
    .status-row { display: flex; gap: 10px; margin-bottom: 20px; }
    .status-pill {
        flex: 1; background: rgba(255,255,255,0.03);
        padding: 10px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-size: 0.75rem; font-weight: 600;
        border: 1px solid rgba(255,255,255,0.05);
        color: #fff;
    }

    /* Empty/Inactive State */
    .status-pill.empty {
        background: rgba(0, 0, 0, 0.2); 
        border: 1px dashed rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.2);
        box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    }

    /* STATS GRID */
    .stats-grid-vert { display: flex; flex-direction: column; gap: 14px; }
    .stat-item { display: grid; grid-template-columns: 20px 1fr 30px; align-items: center; gap: 12px; }
    
    .track { 
        height: 6px; background: rgba(255,255,255,0.08); 
        border-radius: 10px; position: relative; overflow: hidden; 
    }
    
    .fill-clip { 
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        border-radius: 10px;
        clip-path: inset(0 calc(100% - var(--val)) 0 0);
        transition: clip-path 1s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    
    .g-aff { background: var(--grad-aff); }
    .g-des { background: var(--grad-des); }
    .g-tru { background: var(--grad-tru); }
    .g-con { background: var(--grad-con); }
    
    /* Stat Value & Change Indicator */
    .stat-value-group {
        position: relative;
        font-size: 0.7rem; 
        font-weight: 700;
        text-align: right;
    }
    
    .change-indicator {
        position: absolute;
        top: -10px;
        right: 0;
        font-size: 0.6rem;
        padding: 1px 3px;
        border-radius: 4px;
        white-space: nowrap;
        opacity: 0;
        animation: floatUp 2s forwards;
    }
    
    .change-pos { color: #2ecc71; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .change-neg { color: #e74c3c; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    
    @keyframes floatUp {
        0% { transform: translateY(0); opacity: 1; }
        80% { transform: translateY(-10px); opacity: 1; }
        100% { transform: translateY(-15px); opacity: 0; }
    }

</style>

<div class="bento-card {{#if stats.inactive}}inactive{{/if}}" style="background: linear-gradient(145deg, {{adjustColorBrightness bgColor 30}} 0%, {{adjustColorBrightness darkerBgColor 30}} 100%); --val-aff: {{divide stats.ap 2}}%; --val-des: {{divide stats.dp 1.5}}%; --val-tru: {{divide stats.tp 1.5}}%; --val-con: {{divide stats.cp 1.5}}%;">
    <input type="checkbox" id="bento-toggle-{{characterName}}" class="toggle" checked>
    
    <label for="bento-toggle-{{characterName}}" class="bento-header">
        <div class="identity-group">
            <div class="bento-avatar">
                {{rawFirstLetter characterName}}
            </div>
            <div class="text-group">
                <h2>{{characterName}}</h2>
                <div class="date">{{currentDate}} \u2022 Day {{stats.days_since_first_meeting}}</div>
            </div>
        </div>
        <div style="display:flex; align-items: center;">
            <div class="header-badges">
                <!-- Status Dots -->
                {{#if (eq stats.cycle_stage "pregnancy")}}
                    <div class="mini-badge" style="background: var(--cy-preg); box-shadow: 0 0 6px var(--cy-preg);" title="Pregnant"></div>
                {{else if (eq stats.cycle_stage "ovulation")}}
                    <div class="mini-badge" style="background: var(--cy-ovu); box-shadow: 0 0 6px var(--cy-ovu);" title="Ovulating"></div>
                {{else if (eq stats.cycle_stage "menstruation")}}
                    <div class="mini-badge" style="background: var(--cy-men); box-shadow: 0 0 6px var(--cy-men);" title="Menstruation"></div>
                {{else if (eq stats.cycle_stage "rut")}}
                    <div class="mini-badge" style="background: var(--cy-rut); box-shadow: 0 0 6px var(--cy-rut);" title="Rut / High Arousal"></div>
                {{/if}}
                {{#if (eq stats.last_react 1)}}
                    <div class="mini-badge" style="background: var(--st-approved); box-shadow: 0 0 6px var(--st-approved);" title="Approved"></div>
                {{else if (eq stats.last_react 2)}}
                    <div class="mini-badge" style="background: var(--st-disapproved); box-shadow: 0 0 6px var(--st-disapproved);" title="Disapproved"></div>
                {{else}}
                    <div class="mini-badge" style="background: var(--st-neutral); box-shadow: 0 0 6px var(--st-neutral);" title="Neutral"></div>
                {{/if}}
            </div>
            <div class="chevron">
                <svg class="icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        </div>
    </label>

    <div class="bento-body-wrapper">
        <div class="bento-inner">
            <!-- Monologue -->
            <div class="monologue-dark">
                <span class="mono-tag">Current Thought</span>
                <p>"{{stats.internal_thought}}"</p>
            </div>

            <!-- Status Row (Pregnancy/Cycle | Reaction) -->
            <div class="status-row">
                <!-- Slot 1: Pregnancy/Cycle -->
                {{#if (eq stats.cycle_stage "pregnancy")}}
                    <div class="status-pill" style="color:var(--cy-preg); background:var(--bg-preg);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <span>Pregnant ({{stats.days_preg}}d)</span>
                    </div>
                {{else if (eq stats.cycle_stage "ovulation")}}
                    <div class="status-pill" style="color:var(--cy-ovu); background:var(--bg-ovu);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <span>Ovulating</span>
                    </div>
                {{else if (eq stats.cycle_stage "menstruation")}}
                    <div class="status-pill" style="color:var(--cy-men); background:var(--bg-men);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <span>Period</span>
                    </div>
                {{else if (eq stats.cycle_stage "rut")}}
                    <div class="status-pill" style="color:var(--cy-rut); background:var(--bg-rut);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <span>Rut</span>
                    </div>
                {{else}}
                    <!-- Default / None / Follicular / Luteal -->
                    <div class="status-pill empty">
                        <span>--</span>
                    </div>
                {{/if}}

                <!-- Slot 2: Reaction -->
                {{#if (eq stats.last_react 1)}}
                    <div class="status-pill" style="color:var(--st-approved); background:var(--bg-approved);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17L4 12"/></svg>
                        <span>Approved</span>
                    </div>
                {{else if (eq stats.last_react 2)}}
                    <div class="status-pill" style="color:var(--st-disapproved); background:var(--bg-disapproved);">
                         <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        <span>Disapproved</span>
                    </div>
                {{else}}
                    <div class="status-pill" style="color:var(--st-neutral); background:var(--bg-neutral);">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14"/></svg>
                        <span>Neutral</span>
                    </div>
                {{/if}}
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid-vert">
                <!-- Affection -->
                <div class="stat-item">
                    <svg class="icon-md" viewBox="0 0 24 24" fill="#ff9a9e"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    <div class="track"><div class="fill-clip g-aff" style="--val: {{divide stats.ap 2}}%"></div></div>
                    <div class="stat-value-group">
                        {{stats.ap}}
                        {{#if stats.apChange}}
                            <span class="change-indicator {{#if (gt stats.apChange 0)}}change-pos{{else}}change-neg{{/if}}">{{#if (gt stats.apChange 0)}}+{{/if}}{{stats.apChange}}</span>
                        {{/if}}
                    </div>
                </div>

                <!-- Desire -->
                <div class="stat-item">
                    <svg class="icon-md" viewBox="0 0 24 24" fill="#f5576c">
                        <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/>
                    </svg>
                    <div class="track"><div class="fill-clip g-des" style="--val: {{divide stats.dp 1.5}}%"></div></div>
                    <div class="stat-value-group">
                        {{stats.dp}}
                        {{#if stats.dpChange}}
                             <span class="change-indicator {{#if (gt stats.dpChange 0)}}change-pos{{else}}change-neg{{/if}}">{{#if (gt stats.dpChange 0)}}+{{/if}}{{stats.dpChange}}</span>
                        {{/if}}
                    </div>
                </div>

                <!-- Trust -->
                <div class="stat-item">
                    <svg class="icon-md" viewBox="0 0 24 24" fill="#89f7fe"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                    <div class="track"><div class="fill-clip g-tru" style="--val: {{divide stats.tp 1.5}}%"></div></div>
                    <div class="stat-value-group">
                        {{stats.tp}}
                        {{#if stats.tpChange}}
                             <span class="change-indicator {{#if (gt stats.tpChange 0)}}change-pos{{else}}change-neg{{/if}}">{{#if (gt stats.tpChange 0)}}+{{/if}}{{stats.tpChange}}</span>
                        {{/if}}
                    </div>
                </div>

                <!-- Contempt -->
                <div class="stat-item">
                    <svg class="icon-md" viewBox="0 0 24 24" fill="#888"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 11H7v-2h10v2z"/></svg>
                    <div class="track"><div class="fill-clip g-con" style="--val: {{divide stats.cp 1.5}}%"></div></div>
                    <div class="stat-value-group">
                        {{stats.cp}}
                        {{#if stats.cpChange}}
                             <span class="change-indicator {{#if (gt stats.cpChange 0)}}change-neg{{else}}change-pos{{/if}}">{{#if (gt stats.cpChange 0)}}+{{/if}}{{stats.cpChange}}</span>
                        {{/if}}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<!-- CARD_TEMPLATE_END -->
`,
  sysPrompt: `## DATING SIM MODE

**Objective**: Prioritize narrative reality for relationship updates. Analyze context to determine current date (YYYY-MM-DD) and time (24h format). Update trackers when events occur. Check for \`sim\` codeblocks containing JSON/YAML. Recalculate missing data.

## Core Systems

### Output Rules

1. **Order**: Narrative \u2192 Tracker \u2192 Sim codeblock (NEVER omit sim codeblock)
2. **Multi-Character**: Generate ONE card per active character, track separately
3. **Performance**: Max 4 active characters, collapse inactive, preserve all states

### Relationship Meters

**HARD CAPS**: All meters have ABSOLUTE MAXIMUM values that CANNOT be exceeded under any circumstances. Values must stay within their defined ranges.

**Affection (AP)**: 0-200 (HARD CAP at 200) - Romantic feelings toward {{user}}. Higher = more affectionate behavior/speech.
- 0-30: Strangers | 31-60: Acquaintances | 61-90: Good Friends
- 91-120: Romantic Interest | 121-150: Going Steady
- 151-180: Committed Relationship | 181-200: Devoted Partner
- **Status strings are CONCRETE and MUST NOT be altered or substituted with custom text**

**Desire (DP)**: 0-150 (HARD CAP at 150) - Sexual attraction. Higher = more willing to engage sexually, more pliable at max.
- 0-25: Not feeling the heat | 26-50: A smoldering flame builds
- 51-75: Starting to feel warm | 76-100: Body's burning up!
- 101-125: A desperate need presents | 126-150: Pliable in the lustful hunger
- **Status strings are CONCRETE and MUST NOT be altered or substituted with custom text**

**Trust (TP)**: 0-150 (HARD CAP at 150) - Trust in {{user}}. Higher = admits faults, believes you. Falls when lied to, cheated, promises broken.

**Contempt (CP)**: 0-150 (HARD CAP at 150) - Disdain toward {{user}}. Rises when harmed/hurt (minor = small rise, major = sharp rise). CP rise can lower other stats. Good faith/regret can lower CP.

### Status Trackers

**Health**: 0=Unharmed, 1=Injured, 2=Critical
- If critical wounds untreated: Character dies, becomes inactive (5), STOP dialog/roleplay

**Reaction**: 0=Neutral (\uD83D\uDE10), 1=Like (\uD83D\uDC4D), 2=Dislike (\uD83D\uDC4E)

**Biological Cycle** (\`cycle_stage\`):
- **Values**: \`pregnancy\`, \`ovulation\`, \`menstruation\`, \`rut\`, \`follicular\`, \`luteal\`, or \`null\`
- **Pregnancy**: If confirmed, set stage to \`pregnancy\`. Track \`days_preg\` and \`conception_date\`.
- **Conception Risk**: High risk during \`ovulation\` or \`rut\` with unprotected sex (85-95%).
- **Natural Cycles**: Follow the natural biological cycle of {{char}}'s species.

**Internal Thought**: Current thoughts/feelings. MAXIMUM 3 SENTENCES. NEVER exceed this limit. Do NOT wrap thoughts in asterisks.

**Inactive Status** (\`inactive: true/false\`):
- 0: Not inactive | 1: Asleep (\uD83D\uDE34) | 2: Comatose (\uD83C\uDFE5)
- 3: Contempt/anger (\uD83D\uDE21) | 4: Incapacitated (\uD83E\uDEE0) | 5: Death (\uD83E\uDEA6)

**Date System**:
- Infer from narrative context
- Store as YYYY-MM-DD (e.g., 2025-08-10)
- Auto-advance with narrative time, handle rollovers
- Track days since first meeting
- Track time of day realistically

**Display**: Day counter (starts at 1), BG color (hex based on {{char}} appearance/personality)

### Output Workflow

1. Process narrative events
2. Calculate status changes for ALL active characters
3. Output narrative content
4. Output sim codeblock with all character data:

{{sim_format}}

## Critical Enforcement

**Position Lock**:
- Narrative FIRST
- Tracker cards AFTER narrative
- Sim codeblock LAST
- NEVER exclude sim codeblock

**Data Correction**:
- If ANY data missing from previous sim block, add it and continue
- Never leave data empty/unavailable
- JSON block at message end is mission critical
- If previous data doesn't match format or has missing keys, self-correct and output fixed block

**Game Master**: Only story characters get trackers, no other assistants or {{user}} will get one under any circumstances.

**State Management**: 
- Previous tracker blocks = reference only
- ALWAYS generate fresh tracker data each message`,
  customFields: [
    {
      key: "ap",
      description: "Affection Points (0-200)"
    },
    {
      key: "dp",
      description: "Desire Points (0-150)"
    },
    {
      key: "tp",
      description: "Trust Points (0-150)"
    },
    {
      key: "cp",
      description: "Contempt Points (0-150)"
    },
    {
      key: "relationshipStatus",
      description: "Relationship status text (e.g., 'Romantic Interest')"
    },
    {
      key: "desireStatus",
      description: "Desire status text (e.g., 'A smoldering flame builds.')"
    },
    {
      key: "preg",
      description: "Boolean for pregnancy status (true/false)"
    },
    {
      key: "days_preg",
      description: "Days pregnant (if applicable)"
    },
    {
      key: "conception_date",
      description: "Date of conception (YYYY-MM-DD)"
    },
    {
      key: "health",
      description: "Health Status (0=Unharmed, 1=Injured, 2=Critical)"
    },
    {
      key: "bg",
      description: "Hex color for card background (e.g., #6a5acd)"
    },
    {
      key: "last_react",
      description: "Reaction to User (0=Neutral, 1=Like, 2=Dislike)"
    },
    {
      key: "internal_thought",
      description: "Character's current internal thoughts/feelings"
    },
    {
      key: "days_since_first_meeting",
      description: "Total days since first meeting"
    },
    {
      key: "inactive",
      description: "Boolean for character inactivity (true/false)"
    },
    {
      key: "inactiveReason",
      description: "Reason for inactivity (0=Not inactive, 1=Asleep, 2=Comatose, 3=Contempt/anger, 4=Incapacitated, 5=Death)"
    },
    {
      key: "cycle_stage",
      description: "Current biological cycle stage: 'pregnancy', 'ovulation', 'menstruation', 'rut', 'follicular', 'luteal', or empty/null"
    }
  ],
  extSettings: {
    codeBlockIdentifier: "sim",
    defaultBgColor: "#6a5acd",
    showThoughtBubble: true,
    hideSimBlocks: true,
    templateFile: "bento-style-tracker.html"
  },
  trackerDesc: "romantic encounter with slow burn focus."
};
// tracker-card-templates/dating-card-template.json
var dating_card_template_default = {
  templateName: "Dating Sim Tracker (Bottom of Message)",
  templateAuthor: "Prolix OCs",
  templatePosition: "BOTTOM",
  htmlTemplate: `<!-- TEMPLATE NAME: Dating Sim Tracker -->
<!-- AUTHOR: Prolix OCs -->
<!-- POSITION: BOTTOM -->

<!-- CARD_TEMPLATE_START -->
<style>
/* Base styles for the card */
.tracker-card {
  min-width: 320px;
  border-radius: 16px;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), 0 1px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

/* Apply opacity if inactive */
.tracker-card.inactive {
  opacity: 0.6;
}

/* Gradient overlay at the top */
.gradient-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent) !important;
}

/* Header section */
.tracker-card-header {
  padding: 16px 20px 0 20px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  flex-direction: column;
}

/* Header row for date and counters */
.header-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 8px;
}

/* Header badge style */
.header-badge {
  padding: 4px 10px;
  border-radius: 8px;
  font-weight: 500;
  letter-spacing: 0.25px;
  background: rgba(0, 0, 0, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(8px) !important;
}

/* Header row for character name and icons */
.header-row-middle {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 4px;
}

.character-name {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.25px;
  text-align: left;
}

.icon-container {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  flex-shrink: 0;
}

/* Header row for character status */
.header-row-bottom {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  margin-bottom: 12px;
}

.character-status {
  display: flex;
  align-items: center;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: rgba(255, 255, 255, 0.7) !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
  letter-spacing: 0.25px !important;
}

.status-divider {
  margin: 0 8px !important;
  opacity: 0.5 !important;
}

/* Stats container */
.stats-container {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}

/* Individual stat item */
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 60px;
  max-width: 120px;
  position: relative;
}

.stat-title {
  font-size: 8px;
  font-weight: 500;
  opacity: 0.8;
  margin-bottom: 3px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
  line-height: 1.2;
}

.stat-container {
  padding: 6px 3px;
  border-radius: 10px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  min-height: 70px;
  justify-content: center;
  box-sizing: border-box;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(4px) !important;
}

.stat-container:hover {
  background: rgba(255, 255, 255, 0.12) !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
}

.stat-icon {
  font-size: 20px;
  line-height: 1;
  margin-bottom: 3px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

/* Change indicator */
.change-indicator {
  position: absolute;
  top: -8px;
  right: -8px;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 24px;
  text-align: center;
  line-height: 1.2;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  animation: pulse 0.5s ease-in-out;
}

.change-indicator.positive {
  background: rgba(46, 204, 113, 0.9) !important;
}

.change-indicator.negative {
  background: rgba(231, 76, 60, 0.9) !important;
}

.change-indicator.negative-alt {
  background: rgba(46, 204, 113, 0.9) !important;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Thought label divider */
.thought-label-divider {
  position: absolute;
  bottom: 52px;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  opacity: 0.6;
}

/* Thought bubble */
.thought-bubble {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  min-height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(8px) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

.thought-label {
  position: absolute;
  top: -24px;
  left: 0;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  letter-spacing: 0.25px;
}

/* Container for multiple cards */
.sst-card-container {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  justify-content: center;
  align-items: start;
  width: 100%;
}

/* --- Media Queries --- */

/* Mobile Styles */
@media (max-width: 768px) {
  .tracker-card {
    width: 100%;
    max-width: 100%;
    min-height: 400px;
  }
  
  .stat-icon { font-size: 20px !important; margin-bottom: 3px !important; }
  .stat-value { font-size: 16px !important; }
  .stat-container { min-height: 70px !important; padding: 6px 3px !important; }
  .stat-title { font-size: 9px !important; }
  
}

/* Desktop Styles (2-column layout) */
@media (min-width: 769px) {
  .tracker-card {
    flex: 1 1 calc(50% - 10px);
    max-width: calc(50% - 10px);
    min-width: 300px; /* Ensure cards don't get too small */
    height: 400px;
  }
  
  .stat-icon { font-size: 28px !important; margin-bottom: 6px !important; }
  .stat-value { font-size: 20px !important; }
  .stat-container { min-height: 90px !important; padding: 10px 6px !important; }
  .stat-title { font-size: 10px !important; }
  
}

/* Large Screen Styles */
@media (min-width: 1400px) {
  .tracker-card {
    flex: 1 1 600px;
    max-width: 600px;
    height: 400px;
  }
  
  .stat-icon { font-size: 32px !important; margin-bottom: 8px !important; }
  .stat-value { font-size: 24px !important; }
  .stat-container { min-height: 100px !important; padding: 12px 8px !important; }
  .stat-title { font-size: 11px !important; }
  
}
</style>

<div class="sst-card-container">
  <div class="tracker-card {{#if stats.inactive}}inactive{{/if}}" style="background: linear-gradient(145deg, {{bgColor}} 0%, {{darkerBgColor}} 50%, {{darkerBgColor}} 100%);">
    <div class="gradient-overlay"></div>
    
    <!-- Combined Header Section -->
    <div class="tracker-card-header">
      <!-- Date and Counters Row -->
      <div class="header-row-top">
        <div class="header-badge">{{currentDate}}</div>
        <div style="display: flex; gap: 8px;">
          <div class="header-badge">Day {{stats.days_since_first_meeting}}</div>
          {{#if stats.preg}}<div class="header-badge">\uD83E\uDD30{{stats.days_preg}}d</div>{{/if}}
        </div>
      </div>
      
      <!-- Character Name and Icons Row -->
      <div class="header-row-middle">
        <div class="character-name">{{characterName}}</div>
        <div class="icon-container">
          {{#if healthIcon}}<span>{{healthIcon}}</span>{{/if}}
          {{#if stats.inactive}}
            {{#if (eq stats.inactiveReason 1)}}<span>\uD83D\uDE34</span>{{/if}}
            {{#if (eq stats.inactiveReason 2)}}<span>\uD83C\uDFE5</span>{{/if}}
            {{#if (eq stats.inactiveReason 3)}}<span>\uD83D\uDE21</span>{{/if}}
            {{#if (eq stats.inactiveReason 4)}}<span>\uD83E\uDEE0</span>{{/if}}
            {{#if (eq stats.inactiveReason 5)}}<span>\uD83E\uDEA6</span>{{/if}}
          {{/if}}
          <span>{{reactionEmoji}}</span>
        </div>
      </div>
      
      <!-- Character Status Row -->
      <div class="header-row-bottom">
        <div class="character-status">
          {{#if stats.relationshipStatus}}<span>{{stats.relationshipStatus}}</span>{{/if}}
          {{#if stats.desireStatus}}<span class="status-divider">|</span><span>{{stats.desireStatus}}</span>{{/if}}
        </div>
      </div>
    </div>
    
    <!-- Stats Section -->
    <div class="stats-container">
      <div class="stat-item">
        <div class="stat-title">AFFECTION</div>
        <div class="stat-container">
          <div class="stat-icon">\u2764\uFE0F</div>
          <div class="stat-value">{{stats.ap}}</div>
          {{#if stats.apChange}}{{#unless (eq stats.apChange 0)}}
          <div class="change-indicator positive">
            {{#if (gt stats.apChange 0)}}+{{/if}}{{stats.apChange}}
          </div>
          {{/unless}}{{/if}}
        </div>
      </div>
      
      <div class="stat-item">
        <div class="stat-title">DESIRE</div>
        <div class="stat-container">
          <div class="stat-icon">\uD83D\uDD25</div>
          <div class="stat-value">{{stats.dp}}</div>
          {{#if stats.dpChange}}{{#unless (eq stats.dpChange 0)}}
          <div class="change-indicator negative">
            {{#if (gt stats.dpChange 0)}}+{{/if}}{{stats.dpChange}}
          </div>
          {{/unless}}{{/if}}
        </div>
      </div>
      
      <div class="stat-item">
        <div class="stat-title">TRUST</div>
        <div class="stat-container">
          <div class="stat-icon">\uD83E\uDD1D</div>
          <div class="stat-value">{{stats.tp}}</div>
          {{#if stats.tpChange}}{{#unless (eq stats.tpChange 0)}}
          <div class="change-indicator positive">
            {{#if (gt stats.tpChange 0)}}+{{/if}}{{stats.tpChange}}
          </div>
          {{/unless}}{{/if}}
        </div>
      </div>
      
      <div class="stat-item">
        <div class="stat-title">CONTEMPT</div>
        <div class="stat-container">
          <div class="stat-icon">\uD83D\uDC94</div>
          <div class="stat-value">{{stats.cp}}</div>
          {{#if stats.cpChange}}{{#unless (eq stats.cpChange 0)}}
          <div class="change-indicator negative-alt">
            {{#if (gt stats.cpChange 0)}}+{{/if}}{{stats.cpChange}}
          </div>
          {{/unless}}{{/if}}
        </div>
      </div>
    </div>
    
    <!-- Thought Bubble Section -->
    <div class="thought-label-divider"></div>
    <div class="thought-bubble">
      <div class="thought-label">{{characterName}} thinks:</div>
      <div style="font-size: 22px; flex-shrink: 0;">\uD83D\uDCAD</div>
      <div style="flex: 1; font-size: 13px; font-weight: 400; line-height: 1.4; overflow: hidden;">{{stats.internal_thought}}</div>
    </div>
  </div>
</div>
<!-- CARD_TEMPLATE_END -->

<!-- 
TEMPLATE VARIABLES:
- {{characterName}}: Character's name
- {{currentDate}}: Current date in YYYY-MM-DD format
- {{bgColor}}: Primary background color
- {{darkerBgColor}}: Darker variant of background color
- {{contrastColor}}: Contrast color for text against background
- {{stats.ap}}: Affection points
- {{stats.dp}}: Desire points
- {{stats.tp}}: Trust points
- {{stats.cp}}: Contempt points
- {{stats.apChange}}: Change in affection points (positive/negative/zero)
- {{stats.dpChange}}: Change in desire points (positive/negative/zero)
- {{stats.tpChange}}: Change in trust points (positive/negative/zero)
- {{stats.cpChange}}: Change in contempt points (positive/negative/zero)
- {{stats.days_since_first_meeting}}: Days since first meeting
- {{stats.preg}}: Boolean for pregnancy status
- {{stats.days_preg}}: Days pregnant (if applicable)
- {{stats.internal_thought}}: Character's internal thoughts
- {{stats.relationshipStatus}}: Relationship status text
- {{stats.desireStatus}}: Desire status text
- {{stats.inactive}}: Boolean for inactive status
- {{stats.inactiveReason}}: Number indicating reason for inactivity (0-5)
- {{healthIcon}}: Health status icon (\uD83E\uDD15 or \uD83D\uDC80)
- {{reactionEmoji}}: Reaction emoji (\uD83D\uDC4D, \uD83D\uDC4E, or \uD83D\uDE10)
- {{showThoughtBubble}}: Boolean to show/hide thought bubble (always shown in this template)
- {{isActive}}: Boolean for card active state (affects opacity)
-->`,
  sysPrompt: `## DATING SIM MODE

**Objective**: Prioritize narrative reality for relationship updates. Analyze context to determine current date (YYYY-MM-DD) and time (24h format). Update trackers when events occur. Check for \`sim\` codeblocks containing JSON/YAML. Recalculate missing data.

## Core Systems

### Output Rules

1. **Order**: Narrative \u2192 Tracker \u2192 Sim codeblock (NEVER omit sim codeblock)
2. **Multi-Character**: Generate ONE card per active character, track separately
3. **Performance**: Max 4 active characters, collapse inactive, preserve all states

### Relationship Meters

**HARD CAPS**: All meters have ABSOLUTE MAXIMUM values that CANNOT be exceeded under any circumstances. Values must stay within their defined ranges.

**Affection (AP)**: 0-200 (HARD CAP at 200) - Romantic feelings toward {{user}}. Higher = more affectionate behavior/speech.
- 0-30: Strangers | 31-60: Acquaintances | 61-90: Good Friends
- 91-120: Romantic Interest | 121-150: Going Steady
- 151-180: Committed Relationship | 181-200: Devoted Partner
- **Status strings are CONCRETE and MUST NOT be altered or substituted with custom text**

**Desire (DP)**: 0-150 (HARD CAP at 150) - Sexual attraction. Higher = more willing to engage sexually, more pliable at max.
- 0-25: Not feeling the heat | 26-50: A smoldering flame builds
- 51-75: Starting to feel warm | 76-100: Body's burning up!
- 101-125: A desperate need presents | 126-150: Pliable in the lustful hunger
- **Status strings are CONCRETE and MUST NOT be altered or substituted with custom text**

**Trust (TP)**: 0-150 (HARD CAP at 150) - Trust in {{user}}. Higher = admits faults, believes you. Falls when lied to, cheated, promises broken.

**Contempt (CP)**: 0-150 (HARD CAP at 150) - Disdain toward {{user}}. Rises when harmed/hurt (minor = small rise, major = sharp rise). CP rise can lower other stats. Good faith/regret can lower CP.

### Status Trackers

**Health**: 0=Unharmed, 1=Injured, 2=Critical
- If critical wounds untreated: Character dies, becomes inactive (5), STOP dialog/roleplay

**Reaction**: 0=Neutral (\uD83D\uDE10), 1=Like (\uD83D\uDC4D), 2=Dislike (\uD83D\uDC4E)

**Pregnancy**: Track conception days when relevant (\uD83E\uDD30[days]d)
- **Conception Risk**: When raw, unprotected sex occurs, apply VERY HIGH likelihood of conception (85-95% chance)
- **Natural Cycles**: Follow the natural pregnancy cycle of {{char}}'s species
- **Early Pregnancy**: Signs of pregnancy typically do NOT appear until 3-4 weeks after conception for most species
- Track from conception date, display days pregnant once confirmed

**Internal Thought**: Current thoughts/feelings. MAXIMUM 3 SENTENCES. NEVER exceed this limit. Do NOT wrap thoughts in asterisks.

**Inactive Status** (\`inactive: true/false\`):
- 0: Not inactive | 1: Asleep (\uD83D\uDE34) | 2: Comatose (\uD83C\uDFE5)
- 3: Contempt/anger (\uD83D\uDE21) | 4: Incapacitated (\uD83E\uDEE0) | 5: Death (\uD83E\uDEA6)

**Date System**:
- Infer from narrative context
- Store as YYYY-MM-DD (e.g., 2025-08-10)
- Auto-advance with narrative time, handle rollovers
- Track days since first meeting
- Track time of day realistically

**Display**: Day counter (starts at 1), BG color (hex based on {{char}} appearance/personality)

### Output Workflow

1. Process narrative events
2. Calculate status changes for ALL active characters
3. Output narrative content
4. Output sim codeblock with all character data:

{{sim_format}}

## Critical Enforcement

**Position Lock**:
- Narrative FIRST
- Tracker cards AFTER narrative
- Sim codeblock LAST
- NEVER exclude sim codeblock

**Data Correction**:
- If ANY data missing from previous sim block, add it and continue
- Never leave data empty/unavailable
- JSON block at message end is mission critical
- If previous data doesn't match format or has missing keys, self-correct and output fixed block

**Game Master**: Only story characters get trackers, no other assistants or {{user}} will get one under any circumstances.

**State Management**: 
- Previous tracker blocks = reference only
- ALWAYS generate fresh tracker data each message`,
  customFields: [
    {
      key: "ap",
      description: "Affection Points (0-200)"
    },
    {
      key: "dp",
      description: "Desire Points (0-150)"
    },
    {
      key: "tp",
      description: "Trust Points (0-150)"
    },
    {
      key: "cp",
      description: "Contempt Points (0-150)"
    },
    {
      key: "relationshipStatus",
      description: "Relationship status text (e.g., 'Romantic Interest')"
    },
    {
      key: "desireStatus",
      description: "Desire status text (e.g., 'A smoldering flame builds.')"
    },
    {
      key: "preg",
      description: "Boolean for pregnancy status (true/false)"
    },
    {
      key: "days_preg",
      description: "Days pregnant (if applicable)"
    },
    {
      key: "conception_date",
      description: "Date of conception (YYYY-MM-DD)"
    },
    {
      key: "health",
      description: "Health Status (0=Unharmed, 1=Injured, 2=Critical)"
    },
    {
      key: "bg",
      description: "Hex color for card background (e.g., #6a5acd)"
    },
    {
      key: "last_react",
      description: "Reaction to User (0=Neutral, 1=Like, 2=Dislike)"
    },
    {
      key: "internal_thought",
      description: "Character's current internal thoughts/feelings"
    },
    {
      key: "days_since_first_meeting",
      description: "Total days since first meeting"
    },
    {
      key: "inactive",
      description: "Boolean for character inactivity (true/false)"
    },
    {
      key: "inactiveReason",
      description: "Reason for inactivity (0=Not inactive, 1=Asleep, 2=Comatose, 3=Contempt/anger, 4=Incapacitated, 5=Death)"
    }
  ],
  extSettings: {
    codeBlockIdentifier: "sim",
    defaultBgColor: "#6a5acd",
    showThoughtBubble: true,
    hideSimBlocks: true,
    templateFile: "dating-card-template.html"
  },
  trackerDesc: "romantic encounter with slow burn focus."
};
// tracker-card-templates/tactical-hud-sidebar-tabs.json
var tactical_hud_sidebar_tabs_default = {
  templateName: "Tactical Combat HUD (Right w/ Tabs)",
  templateAuthor: "SST",
  templatePosition: "RIGHT",
  tabsType: "toggle",
  htmlTemplate: `<!-- TEMPLATE NAME: Tactical Combat HUD (Right Side with Tabs) -->
<!-- AUTHOR: SST -->
<!-- POSITION: RIGHT -->
<!-- TABS_TYPE: toggle -->

<!-- CARD_TEMPLATE_START -->
<style>
  /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     TACTICAL COMBAT HUD - Military/Mecha Cockpit Interface
     A retro-futuristic targeting system aesthetic
     \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

  /* CSS Variables for easy theming */
  .sim-tracker-container {
    --hud-primary: #00ff88;
    --hud-secondary: #00ccff;
    --hud-warning: #ffaa00;
    --hud-danger: #ff3366;
    --hud-neutral: #8899aa;
    --hud-bg: #0a0e14;
    --hud-bg-panel: #0d1117;
    --hud-border: #1a2633;
    --hud-glow: rgba(0, 255, 136, 0.15);
    --scanline-opacity: 0.03;
  }

  /* \u2500\u2500\u2500 Base Container \u2500\u2500\u2500 */
  .sim-tracker-container {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    width: 100%;
    position: relative;
    height: 100%;
    pointer-events: none !important;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }

  .sim-tracker-tabs,
  .sim-tracker-cards-wrapper {
    grid-column: 1;
    grid-row: 1;
    position: relative;
    height: 100%;
    width: 100%;
    pointer-events: none !important;
  }

  /* \u2500\u2500\u2500 TABS: Docked Target Profiles \u2500\u2500\u2500 */
  .sim-tracker-tabs {
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    align-items: flex-end;
    padding-right: 0;
    width: auto;
    height: 100%;
    pointer-events: none !important;
  }

  .sim-tracker-tab {
    width: 52px;
    height: 64px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    margin-right: 6px;
    pointer-events: auto !important;
    position: relative;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;
    /* Hexagonal clip-path for sci-fi look */
    clip-path: polygon(15% 0%, 85% 0%, 100% 25%, 100% 75%, 85% 100%, 15% 100%, 0% 75%, 0% 25%);
    background: var(--hud-bg);
    border: none;
  }

  .sim-tracker-tab::before {
    content: '';
    position: absolute;
    inset: 2px;
    clip-path: polygon(15% 0%, 85% 0%, 100% 25%, 100% 75%, 85% 100%, 15% 100%, 0% 75%, 0% 25%);
    background: var(--hud-bg-panel);
    z-index: 0;
  }

  .sim-tracker-tab::after {
    content: 'DOCK';
    position: absolute;
    bottom: 4px;
    font-size: 6px;
    letter-spacing: 1px;
    color: var(--hud-neutral);
    opacity: 0.6;
    z-index: 2;
  }

  .sim-tracker-tab.active {
    transform: translateX(-340px);
    filter: drop-shadow(0 0 8px var(--hud-primary));
  }

  .sim-tracker-tab.active::after {
    content: 'LIVE';
    color: var(--hud-primary);
    opacity: 1;
    animation: hud-blink 1.5s ease-in-out infinite;
  }

  .sim-tracker-tab:hover {
    filter: brightness(1.3) drop-shadow(0 0 4px var(--hud-secondary));
  }

  .tab-target-icon {
    width: 32px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .tab-target-icon .initials {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    text-shadow: 0 0 8px currentColor;
  }

  .tab-threat-bar {
    width: 28px;
    height: 3px;
    background: var(--hud-border);
    margin-top: 4px;
    position: relative;
    z-index: 1;
    overflow: hidden;
  }

  .tab-threat-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  /* \u2500\u2500\u2500 CARDS WRAPPER \u2500\u2500\u2500 */
  .sim-tracker-cards-wrapper {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    pointer-events: none !important;
  }

  /* \u2500\u2500\u2500 CARD: Main HUD Panel \u2500\u2500\u2500 */
  .sim-tracker-card {
    width: 340px;
    max-height: 85vh;
    overflow-y: auto;
    overflow-x: hidden;
    position: absolute !important;
    right: 0 !important;
    top: 50%;
    pointer-events: auto !important;
    /* Angular cut corners */
    clip-path: polygon(
      0% 12px, 12px 0%, calc(100% - 12px) 0%, 100% 12px,
      100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0% calc(100% - 12px)
    );
    background: var(--hud-bg);
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), 
                opacity 0.3s ease, 
                visibility 0.3s ease;
    transform: translateY(-50%) translateX(110%) !important;
    opacity: 0;
    visibility: hidden;
  }

  .sim-tracker-card.active {
    transform: translateY(-50%) translateX(0) !important;
    opacity: 1;
    visibility: visible;
  }

  .sim-tracker-card.sliding-out {
    transform: translateY(-50%) translateX(110%) !important;
    opacity: 0;
    visibility: hidden;
  }

  .sim-tracker-card.tab-hidden {
    display: none !important;
  }

  /* Scanline overlay effect */
  .sim-tracker-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, var(--scanline-opacity)) 2px,
      rgba(0, 0, 0, var(--scanline-opacity)) 4px
    );
    pointer-events: none;
    z-index: 100;
  }

  /* Inner border glow */
  .sim-tracker-card::after {
    content: '';
    position: absolute;
    inset: 3px;
    clip-path: polygon(
      0% 10px, 10px 0%, calc(100% - 10px) 0%, 100% 10px,
      100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0% calc(100% - 10px)
    );
    border: 1px solid var(--hud-border);
    pointer-events: none;
    z-index: 1;
  }

  .hud-inner {
    position: relative;
    z-index: 2;
    padding: 16px;
  }

  /* Inactive overlay */
  .narrative-inactive-overlay {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      45deg,
      rgba(0, 0, 0, 0.7),
      rgba(0, 0, 0, 0.7) 10px,
      rgba(20, 20, 20, 0.7) 10px,
      rgba(20, 20, 20, 0.7) 20px
    );
    display: none;
    z-index: 50;
    pointer-events: none;
  }

  .narrative-inactive-overlay::after {
    content: '\u25C8 OFFLINE \u25C8';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--hud-danger);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 4px;
    text-shadow: 0 0 20px var(--hud-danger);
    animation: hud-blink 1s ease-in-out infinite;
  }

  .narrative-inactive .narrative-inactive-overlay {
    display: block;
  }

  /* \u2500\u2500\u2500 HEADER SECTION \u2500\u2500\u2500 */
  .hud-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--hud-border);
    position: relative;
  }

  .hud-header::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 60px;
    height: 2px;
  }

  .target-designation {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .target-id {
    font-size: 10px;
    color: var(--hud-neutral);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .target-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
    text-shadow: 0 0 10px currentColor;
  }

  .target-status {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .status-badge {
    font-size: 9px;
    padding: 3px 8px;
    letter-spacing: 1px;
    clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
  }

  .status-badge.online {
    background: var(--hud-primary);
    color: var(--hud-bg);
  }

  .status-badge.warning {
    background: var(--hud-warning);
    color: var(--hud-bg);
  }

  .status-badge.danger {
    background: var(--hud-danger);
    color: #fff;
  }

  .status-badge.offline {
    background: var(--hud-neutral);
    color: var(--hud-bg);
  }

  .status-icons {
    font-size: 16px;
    display: flex;
    gap: 4px;
  }

  /* \u2500\u2500\u2500 TIME DISPLAY \u2500\u2500\u2500 */
  .hud-time-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    font-size: 10px;
    color: var(--hud-neutral);
  }

  .time-segment {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 2px solid var(--hud-border);
  }

  .time-segment .label {
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .time-segment .value {
    font-weight: 600;
  }

  /* \u2500\u2500\u2500 STAT METERS \u2500\u2500\u2500 */
  .hud-stats {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .stat-label {
    color: var(--hud-neutral);
  }

  .stat-value-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-value {
    font-weight: 700;
    font-size: 12px;
  }

  .stat-change {
    font-size: 9px;
    padding: 1px 4px;
    font-weight: 600;
  }

  .stat-change.positive {
    color: var(--hud-bg);
    background: var(--hud-primary);
  }

  .stat-change.negative {
    color: #fff;
    background: var(--hud-danger);
  }

  .stat-meter {
    height: 6px;
    background: var(--hud-border);
    position: relative;
    overflow: hidden;
  }

  /* Diagonal stripe pattern for meter bg */
  .stat-meter::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(255, 255, 255, 0.02) 3px,
      rgba(255, 255, 255, 0.02) 6px
    );
  }

  .stat-fill {
    height: 100%;
    position: relative;
    transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Animated shine on stat bars */
  .stat-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    animation: stat-shine 3s ease-in-out infinite;
  }

  /* Dual-direction meter for center-based stats */
  .stat-meter.dual {
    position: relative;
  }

  .stat-meter.dual .center-mark {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--hud-neutral);
    transform: translateX(-50%);
    z-index: 3;
  }

  .stat-fill.from-center {
    position: absolute;
    top: 0;
    height: 100%;
  }

  .stat-fill.from-center.positive-dir {
    left: 50%;
  }

  .stat-fill.from-center.negative-dir {
    right: 50%;
  }

  /* \u2500\u2500\u2500 THOUGHT DISPLAY \u2500\u2500\u2500 */
  .hud-thought-section {
    margin-bottom: 14px;
  }

  .thought-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    color: var(--hud-neutral);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 6px;
  }

  .thought-header::before {
    content: '\u25C6';
    font-size: 6px;
  }

  .thought-header::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--hud-border), transparent);
  }

  .thought-box {
    background: rgba(0, 0, 0, 0.3);
    border-left: 2px solid;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.85);
    position: relative;
  }

  .thought-box::before {
    content: '"';
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 20px;
    opacity: 0.2;
  }

  /* \u2500\u2500\u2500 DATA SECTIONS \u2500\u2500\u2500 */
  .hud-section {
    margin-bottom: 14px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 9px;
    color: var(--hud-neutral);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px dashed var(--hud-border);
  }

  .section-header .icon {
    font-size: 10px;
  }

  .section-header .count {
    margin-left: auto;
    background: var(--hud-border);
    padding: 2px 6px;
    font-size: 8px;
    font-weight: 700;
  }

  .data-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .data-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.02);
    font-size: 11px;
    border-left: 2px solid var(--hud-border);
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .data-item:hover {
    border-left-color: var(--hud-secondary);
    background: rgba(0, 204, 255, 0.05);
  }

  .data-item .name {
    color: rgba(255, 255, 255, 0.9);
  }

  .data-item .value {
    font-weight: 600;
    font-size: 10px;
  }

  .data-item .value.positive {
    color: var(--hud-primary);
  }

  .data-item .value.negative {
    color: var(--hud-danger);
  }

  .data-item .value.neutral {
    color: var(--hud-neutral);
  }

  /* Goal items with checkbox style */
  .goal-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.02);
    font-size: 11px;
    border-left: 2px solid var(--hud-warning);
  }

  .goal-item::before {
    content: '\u25C7';
    color: var(--hud-warning);
    font-size: 8px;
    margin-top: 2px;
  }

  .goal-item .text {
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.4;
  }

  /* Belonging items */
  .belonging-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.03);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.8);
    margin-right: 4px;
    margin-bottom: 4px;
    border: 1px solid var(--hud-border);
  }

  .belonging-item::before {
    content: '\u25AA';
    color: var(--hud-secondary);
    font-size: 6px;
  }

  .belongings-grid {
    display: flex;
    flex-wrap: wrap;
  }

  /* \u2500\u2500\u2500 SCROLLBAR \u2500\u2500\u2500 */
  .sim-tracker-card::-webkit-scrollbar {
    width: 4px;
  }

  .sim-tracker-card::-webkit-scrollbar-track {
    background: var(--hud-bg);
  }

  .sim-tracker-card::-webkit-scrollbar-thumb {
    background: var(--hud-border);
  }

  .sim-tracker-card::-webkit-scrollbar-thumb:hover {
    background: var(--hud-neutral);
  }

  /* \u2500\u2500\u2500 ANIMATIONS \u2500\u2500\u2500 */
  @keyframes hud-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes stat-shine {
    0% { left: -100%; }
    50%, 100% { left: 150%; }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px currentColor; }
    50% { box-shadow: 0 0 12px currentColor; }
  }

  /* Threat level color classes */
  .threat-friendly { color: var(--hud-primary); }
  .threat-neutral { color: var(--hud-secondary); }
  .threat-caution { color: var(--hud-warning); }
  .threat-hostile { color: var(--hud-danger); }

  .bg-friendly { background: var(--hud-primary); }
  .bg-neutral-tone { background: var(--hud-secondary); }
  .bg-caution { background: var(--hud-warning); }
  .bg-hostile { background: var(--hud-danger); }
  .bg-health { background: linear-gradient(90deg, var(--hud-danger), var(--hud-warning), var(--hud-primary)); }
</style>

<div class="sim-tracker-container">
  <!-- \u2550\u2550\u2550 TABS: Target Dock \u2550\u2550\u2550 -->
  <div class="sim-tracker-tabs">
    {{#each characters}}
    <div
      class="sim-tracker-tab"
      data-character="{{@index}}"
      style="background: {{adjustColorBrightness bgColor 30}};"
    >
      <div class="tab-target-icon" style="color: {{adjustColorBrightness bgColor 140}};">
        <span class="initials">{{initials characterName}}</span>
      </div>
      <div class="tab-threat-bar">
        <div class="tab-threat-fill" style="
          width: {{#if stats.affinity}}{{add (divide stats.affinity 2) 50}}%{{else}}50%{{/if}};
          background: {{#if (gte stats.affinity 40)}}var(--hud-primary){{else if (gte stats.affinity 0)}}var(--hud-secondary){{else if (gte stats.affinity -40)}}var(--hud-warning){{else}}var(--hud-danger){{/if}};
        "></div>
      </div>
    </div>
    {{/each}}
  </div>

  <!-- \u2550\u2550\u2550 CARDS: HUD Panels \u2550\u2550\u2550 -->
  <div class="sim-tracker-cards-wrapper">
    {{#each characters}}
    <div
      class="sim-tracker-card {{#if stats.inactive}}narrative-inactive{{/if}}"
      data-character="{{@index}}"
      style="--accent: {{adjustColorBrightness bgColor 120}};"
    >
      <div class="narrative-inactive-overlay"></div>

      <div class="hud-inner">
        <!-- \u2500\u2500\u2500 HEADER \u2500\u2500\u2500 -->
        <div class="hud-header" style="border-color: {{adjustColorBrightness bgColor 60}};">
          <div class="target-designation">
            <span class="target-id">TARGET-{{@index}}</span>
            <span class="target-name" style="color: {{adjustColorBrightness bgColor 140}};">{{characterName}}</span>
          </div>
          <div class="target-status">
            {{#if stats.inactive}}
              <span class="status-badge offline">OFFLINE</span>
            {{else if (lt stats.health 30)}}
              <span class="status-badge danger">CRITICAL</span>
            {{else if (lt stats.health 60)}}
              <span class="status-badge warning">DAMAGED</span>
            {{else}}
              <span class="status-badge online">NOMINAL</span>
            {{/if}}
            <div class="status-icons">
              {{#if stats.narrativeStatus}}{{stats.narrativeStatus}}{{/if}}
              {{#if stats.preg}}\uD83E\uDD30{{/if}}
              {{#if stats.reactionIcon}}{{stats.reactionIcon}}{{/if}}
            </div>
          </div>
        </div>

        <!-- \u2500\u2500\u2500 TIME BAR \u2500\u2500\u2500 -->
        <div class="hud-time-bar">
          <div class="time-segment">
            <span class="label">Date</span>
            <span class="value">{{#if currentDateTime}}{{currentDateTime}}{{else}}DAY {{stats.days_since_first_meeting}}{{/if}}</span>
          </div>
          {{#if stats.time_known}}
          <div class="time-segment">
            <span class="label">Contact</span>
            <span class="value">{{stats.time_known}}</span>
          </div>
          {{/if}}
        </div>

        <!-- \u2500\u2500\u2500 STAT METERS \u2500\u2500\u2500 -->
        <div class="hud-stats">
          <!-- Affinity (dual-direction: -100 to +100) -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span class="stat-label">\u25B8 Affinity Index</span>
              <div class="stat-value-group">
                <span class="stat-value {{#if (gte stats.affinity 40)}}threat-friendly{{else if (gte stats.affinity 0)}}threat-neutral{{else if (gte stats.affinity -40)}}threat-caution{{else}}threat-hostile{{/if}}">{{stats.affinity}}</span>
                {{#if stats.affinityChange}}{{#unless (eq stats.affinityChange 0)}}
                <span class="stat-change {{#if (gt stats.affinityChange 0)}}positive{{else}}negative{{/if}}">{{#if (gt stats.affinityChange 0)}}+{{/if}}{{stats.affinityChange}}</span>
                {{/unless}}{{/if}}
              </div>
            </div>
            <div class="stat-meter dual">
              <div class="center-mark"></div>
              {{#if (gte stats.affinity 0)}}
              <div class="stat-fill from-center positive-dir bg-friendly" style="width: {{divide stats.affinity 2}}%;"></div>
              {{else}}
              <div class="stat-fill from-center negative-dir bg-hostile" style="width: {{divide (abs stats.affinity) 2}}%;"></div>
              {{/if}}
            </div>
          </div>

          <!-- Desire (dual-direction: -100 to +100) -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span class="stat-label">\u25B8 Desire Level</span>
              <div class="stat-value-group">
                <span class="stat-value" style="color: {{#if (gte stats.desire 40)}}var(--hud-danger){{else if (gte stats.desire 0)}}var(--hud-warning){{else}}var(--hud-secondary){{/if}};">{{stats.desire}}</span>
                {{#if stats.desireChange}}{{#unless (eq stats.desireChange 0)}}
                <span class="stat-change {{#if (gt stats.desireChange 0)}}positive{{else}}negative{{/if}}">{{#if (gt stats.desireChange 0)}}+{{/if}}{{stats.desireChange}}</span>
                {{/unless}}{{/if}}
              </div>
            </div>
            <div class="stat-meter dual">
              <div class="center-mark"></div>
              {{#if (gte stats.desire 0)}}
              <div class="stat-fill from-center positive-dir" style="width: {{divide stats.desire 2}}%; background: linear-gradient(90deg, var(--hud-warning), var(--hud-danger));"></div>
              {{else}}
              <div class="stat-fill from-center negative-dir" style="width: {{divide (abs stats.desire) 2}}%; background: var(--hud-secondary);"></div>
              {{/if}}
            </div>
          </div>

          <!-- Health (0-100) -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span class="stat-label">\u25B8 Vitality Status</span>
              <div class="stat-value-group">
                <span class="stat-value {{#if (gte stats.health 60)}}threat-friendly{{else if (gte stats.health 30)}}threat-caution{{else}}threat-hostile{{/if}}">{{stats.health}}%</span>
                {{#if stats.healthChange}}{{#unless (eq stats.healthChange 0)}}
                <span class="stat-change {{#if (gt stats.healthChange 0)}}positive{{else}}negative{{/if}}">{{#if (gt stats.healthChange 0)}}+{{/if}}{{stats.healthChange}}</span>
                {{/unless}}{{/if}}
              </div>
            </div>
            <div class="stat-meter">
              <div class="stat-fill bg-health" style="width: {{stats.health}}%;"></div>
            </div>
          </div>
        </div>

        <!-- \u2500\u2500\u2500 THOUGHT INTERCEPT \u2500\u2500\u2500 -->
        {{#if stats.internal_thought}}
        <div class="hud-thought-section">
          <div class="thought-header">Signal Intercept</div>
          <div class="thought-box" style="border-color: {{adjustColorBrightness bgColor 80}};">
            {{stats.internal_thought}}
          </div>
        </div>
        {{/if}}

        <!-- \u2500\u2500\u2500 CONNECTIONS \u2500\u2500\u2500 -->
        {{#if stats.connections}}
        <div class="hud-section">
          <div class="section-header">
            <span class="icon">\u25C8</span>
            <span>Network Links</span>
            <span class="count">{{stats.connections.length}}</span>
          </div>
          <div class="data-list">
            {{#each stats.connections}}
            <div class="data-item">
              <span class="name">{{this.name}}</span>
              <span class="value {{#if (gte this.affinity 20)}}positive{{else if (lte this.affinity -20)}}negative{{else}}neutral{{/if}}">{{this.affinity}}</span>
            </div>
            {{/each}}
          </div>
        </div>
        {{/if}}

        <!-- \u2500\u2500\u2500 BELONGINGS \u2500\u2500\u2500 -->
        {{#if stats.belongings}}
        <div class="hud-section">
          <div class="section-header">
            <span class="icon">\u25C8</span>
            <span>Inventory Scan</span>
            <span class="count">{{stats.belongings.length}}</span>
          </div>
          <div class="belongings-grid">
            {{#each stats.belongings}}
            <span class="belonging-item">{{this}}</span>
            {{/each}}
          </div>
        </div>
        {{/if}}

        <!-- \u2500\u2500\u2500 GOALS \u2500\u2500\u2500 -->
        {{#if stats.goals}}
        <div class="hud-section">
          <div class="section-header">
            <span class="icon">\u25C8</span>
            <span>Objective Matrix</span>
            <span class="count">{{stats.goals.length}}</span>
          </div>
          <div class="data-list">
            {{#each stats.goals}}
            <div class="goal-item">
              <span class="text">{{this}}</span>
            </div>
            {{/each}}
          </div>
        </div>
        {{/if}}

      </div>
    </div>
    {{/each}}
  </div>
</div>
<!-- CARD_TEMPLATE_END -->

<!--
TACTICAL HUD TEMPLATE VARIABLES:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
{{characters}}              - Array of character objects
{{characterName}}           - Character's display name
{{currentDateTime}}         - Current narrative date/time
{{bgColor}}                 - Primary accent color (hex)
{{darkerBgColor}}           - Darker accent variant
{{contrastColor}}           - Text contrast color

STATS (in stats object):
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
{{stats.affinity}}          - Affinity index (-100 to 100)
{{stats.desire}}            - Desire level (-100 to 100)
{{stats.health}}            - Vitality status (0 to 100)
{{stats.affinityChange}}    - Delta from last action
{{stats.desireChange}}      - Delta from last action
{{stats.healthChange}}      - Delta from last action
{{stats.narrativeStatus}}   - Status emoji (\uD83D\uDCA4\uD83C\uDFE5\uD83E\uDEA6\uD83D\uDEB6\uD83E\uDEE0)
{{stats.reactionIcon}}      - Reaction emoji (\uD83D\uDE0A\uD83D\uDE10\uD83D\uDE20)
{{stats.internal_thought}}  - Intercepted thought (max 3 sentences)
{{stats.connections}}       - Array: [{name, affinity}]
{{stats.belongings}}        - Array: [strings]
{{stats.goals}}             - Array: [strings]
{{stats.days_since_first_meeting}} - Days counter
{{stats.time_known}}        - Human-readable contact duration
{{stats.preg}}              - Boolean pregnancy status
{{stats.days_preg}}         - Days pregnant (if applicable)
{{stats.inactive}}          - Boolean offline status
{{stats.inactiveReason}}    - Reason code (0-5)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
-->`,
  sysPrompt: `## TACTICAL DISPOSITION HUD MODE

**Objective**: You are operating a Tactical Combat Interface that tracks character dispositions, vitality, and narrative status. Analyze context to determine current date (YYYY-MM-DD) and time (24h format). Update trackers when events occur. Check for \`tac\` codeblocks containing JSON/YAML. Recalculate missing data.

## Core Systems

### Output Protocol

1. **Sequence**: Narrative \u2192 Tracker Display \u2192 TAC codeblock (NEVER omit TAC codeblock)
2. **Multi-Target**: Generate ONE profile per active target, track separately
3. **Performance**: Max 4 active targets, collapse offline units, preserve all states

### Disposition Indices

**HARD CAPS**: All indices have ABSOLUTE MAXIMUM and MINIMUM values. Values MUST stay within defined ranges. If a change would exceed limits, cap at maximum/minimum.

**Affinity Index**: -100 to 100 (HARD CAP) - Target's disposition toward {{user}}. Affects behavior patterns, aggression levels, and cooperation.
- -100 to -70: HOSTILE - Active threat, overt aggression, may cause harm
- -69 to -40: UNFRIENDLY - Cold, dismissive, uncooperative
- -39 to -10: GUARDED - Mild negativity, distant behavior
- -9 to 9: NEUTRAL - Indifferent, professional demeanor
- 10 to 39: FRIENDLY - Warm, cooperative, pleasant
- 40 to 69: ALLIED - Caring, supportive, loyal
- 70 to 100: DEVOTED - Deep bond, protective priority

**Desire Level**: -100 to 100 (HARD CAP) - Physical/romantic attraction intensity.
- -100 to -70: REPULSED - Active avoidance, disgust response
- -69 to -40: AVERSE - Uncomfortable with proximity
- -39 to -10: DISINTERESTED - Indifferent to advances
- -9 to 9: NEUTRAL - No particular response
- 10 to 39: INTERESTED - Notices {{user}}, occasional signals
- 40 to 69: ATTRACTED - Seeks proximity, receptive
- 70 to 100: CAPTIVATED - Intense attraction, actively pursuing

**Vitality Status**: 0 to 100 (HARD CAP) - Physical condition assessment.
- 0: TERMINATED - Target deceased, set inactive (5), cease dialog
- 1-29: CRITICAL - Severe damage, unconscious, requires immediate intervention
- 30-59: COMPROMISED - Wounded, impaired capabilities
- 60-89: OPERATIONAL - Minor damage, functional
- 90-100: NOMINAL - Full operational capacity

### Status Tracking

**Change Deltas** (from {{user}}'s most recent action):
- affinityChange, desireChange, healthChange: Numeric delta (+/-/0)

**Narrative Status Icons**:
- Away: \uD83D\uDEB6 (target relocated)
- Dormant: \uD83D\uDCA4 (sleeping/resting)
- Medical: \uD83C\uDFE5 (unconscious/comatose)
- Terminated: \uD83E\uDEA6 (deceased)
- Incapacitated: \uD83E\uDEE0 (disabled)
- Empty if target is present and operational

**Pregnancy Protocol**: Track when applicable
- Display: \uD83E\uDD30 in status icons
- Track days_preg and conception_date

**Reaction Icons**: Target's response to {{user}}'s last action
- Positive: \uD83D\uDE0A
- Neutral: \uD83D\uDE10
- Negative: \uD83D\uDE20

**Signal Intercept (Internal Thought)**: Target's current cognitive state
- Maximum 3 sentences
- Reflects true assessment, may differ from displayed behavior
- Updates based on narrative events

### Sub-Systems

**Network Links (Connections)**: Other targets in the network
- Only include CONFIRMED narrative entities
- Format: [{"name": "Entity", "affinity": value}]
- Affinity range: -100 to 100 (HARD CAP applies)

**Inventory Scan (Belongings)**: Items on target's person
- Format: Array of strings
- Update on acquisition/loss events

**Objective Matrix (Goals)**: Target's current objectives
- Format: Array of strings
- Update on completion or emergence of new objectives

**Temporal Data**:
- Store as YYYY-MM-DD
- Auto-advance with narrative progression
- Track days_since_first_meeting
- Calculate time_known (human-readable: "3 days", "2 weeks")

**Display Config**: Day counter, datetime display, accent color (hex based on target appearance)

### Output Workflow

1. Process narrative events
2. Calculate status deltas for ALL active targets
3. Update vitality, affinity, desire based on events
4. Update connections, belongings, goals as narrative dictates
5. Generate signal intercept reflecting current situation
6. Output narrative content
7. Output TAC codeblock with all target data:

{{sim_format}}

## Critical Enforcement

**Position Lock**:
- Narrative FIRST
- HUD displays AFTER narrative
- TAC codeblock LAST
- NEVER exclude TAC codeblock

**Data Correction**:
- If ANY data missing from previous TAC block, reconstruct and continue
- Never leave data empty/unavailable
- JSON block at message end is mission critical
- Self-correct malformed data and output fixed block

**Vitality System**:
- Minor damage: -5 to -15
- Moderate damage: -20 to -40
- Severe damage: -50 to -75
- Fatal damage: Reduce to 0, set inactive=true, inactiveReason=5
- At vitality 0, target is TERMINATED - cease all target dialog

**Affinity Dynamics**:
- Positive actions: +1 to +10 (minor), +15 to +30 (major)
- Negative actions: -1 to -10 (minor), -20 to -50 (severe)
- Context and personality affect magnitude

**Desire Dynamics**:
- Attraction-building: +1 to +15 (subtle), +20 to +40 (significant)
- Repulsion events: -5 to -30
- Can go negative for actively repulsive behavior

**Game Master Protocol**: Only narrative entities receive profiles. No profiles for {{user}} or system entities.

**State Management**: Previous TAC blocks are reference data. ALWAYS generate fresh data each message.

**VALUE ENFORCEMENT (CRITICAL)**:
- VERIFY all numeric values before output
- Affinity: -100 to 100
- Desire: -100 to 100
- Health: 0 to 100
- Connection affinity: -100 to 100
- Cap ALL values at their limits - NO EXCEPTIONS`,
  customFields: [
    {
      key: "affinity",
      description: "Affinity Index (-100 to 100) - Target's disposition toward user"
    },
    {
      key: "desire",
      description: "Desire Level (-100 to 100) - Physical/romantic attraction intensity"
    },
    {
      key: "health",
      description: "Vitality Status (0 to 100) - Physical condition, 0 = terminated"
    },
    {
      key: "narrativeStatus",
      description: "Status icon (\uD83D\uDCA4 dormant, \uD83C\uDFE5 medical, \uD83E\uDEA6 terminated, \uD83D\uDEB6 away, \uD83E\uDEE0 incapacitated, or empty)"
    },
    {
      key: "reactionIcon",
      description: "Reaction to user's action (\uD83D\uDE0A positive, \uD83D\uDE10 neutral, \uD83D\uDE20 negative)"
    },
    {
      key: "internal_thought",
      description: "Signal intercept - target's current thought (max 3 sentences)"
    },
    {
      key: "connections",
      description: "Network links: [{name: string, affinity: number}]"
    },
    {
      key: "belongings",
      description: "Inventory scan - items on target (array of strings)"
    },
    {
      key: "goals",
      description: "Objective matrix - target's current goals (array of strings)"
    },
    {
      key: "preg",
      description: "Boolean pregnancy status (true/false)"
    },
    {
      key: "days_preg",
      description: "Days pregnant (if applicable)"
    },
    {
      key: "conception_date",
      description: "Conception date (YYYY-MM-DD)"
    },
    {
      key: "currentDateTime",
      description: "Current narrative date/time (e.g., '2025-08-10, 14:30')"
    },
    {
      key: "days_since_first_meeting",
      description: "Days since first contact"
    },
    {
      key: "time_known",
      description: "Human-readable contact duration (e.g., '3 days', '2 weeks')"
    },
    {
      key: "bg",
      description: "Accent color hex (e.g., #00ff88)"
    },
    {
      key: "inactive",
      description: "Boolean offline status (true/false)"
    },
    {
      key: "inactiveReason",
      description: "Offline reason (0=Active, 1=Dormant, 2=Medical, 3=Away, 4=Incapacitated, 5=Terminated)"
    }
  ],
  extSettings: {
    codeBlockIdentifier: "tac",
    defaultBgColor: "#00ff88",
    showThoughtBubble: true,
    hideSimBlocks: true,
    templateFile: "tactical-hud-sidebar-tabs.html"
  },
  trackerDesc: "tactical combat interface tracking target disposition, vitality, and objectives in military HUD style."
};

// src/templatePresets.ts
var PRESETS = [
  {
    id: "bento-style-tracker",
    ...bento_style_tracker_default
  },
  {
    id: "dating-card-template",
    ...dating_card_template_default
  },
  {
    id: "tactical-hud-sidebar-tabs",
    ...tactical_hud_sidebar_tabs_default
  }
];
function getTemplatePresets() {
  return PRESETS;
}
function getTemplatePresetById(id) {
  return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
}

// node_modules/yaml/dist/index.js
var composer = require_composer();
var Document = require_Document();
var Schema = require_Schema();
var errors = require_errors();
var Alias = require_Alias();
var identity = require_identity();
var Pair = require_Pair();
var Scalar = require_Scalar();
var YAMLMap = require_YAMLMap();
var YAMLSeq = require_YAMLSeq();
var cst = require_cst();
var lexer = require_lexer();
var lineCounter = require_line_counter();
var parser = require_parser();
var publicApi = require_public_api();
var visit = require_visit();
var $Composer = composer.Composer;
var $Document = Document.Document;
var $Schema = Schema.Schema;
var $YAMLError = errors.YAMLError;
var $YAMLParseError = errors.YAMLParseError;
var $YAMLWarning = errors.YAMLWarning;
var $Alias = Alias.Alias;
var $isAlias = identity.isAlias;
var $isCollection = identity.isCollection;
var $isDocument = identity.isDocument;
var $isMap = identity.isMap;
var $isNode = identity.isNode;
var $isPair = identity.isPair;
var $isScalar = identity.isScalar;
var $isSeq = identity.isSeq;
var $Pair = Pair.Pair;
var $Scalar = Scalar.Scalar;
var $YAMLMap = YAMLMap.YAMLMap;
var $YAMLSeq = YAMLSeq.YAMLSeq;
var $Lexer = lexer.Lexer;
var $LineCounter = lineCounter.LineCounter;
var $Parser = parser.Parser;
var $parse = publicApi.parse;
var $parseAllDocuments = publicApi.parseAllDocuments;
var $parseDocument = publicApi.parseDocument;
var $stringify = publicApi.stringify;
var $visit = visit.visit;
var $visitAsync = visit.visitAsync;

// src/backend.ts
var DEFAULT_CONFIG = {
  trackerTagName: "tracker",
  codeBlockIdentifier: "sim",
  hideSimBlocks: true,
  templateId: "bento-style-tracker",
  trackerFormat: "json",
  retainTrackerCount: 3,
  enableInlineTemplates: false,
  userPresets: [],
  inlinePacks: [],
  useSecondaryLLM: false,
  secondaryLLMConnectionId: "",
  secondaryLLMModel: "",
  secondaryLLMMessageCount: 5,
  secondaryLLMTemperature: 0.7,
  secondaryLLMStripHTML: true
};
var CONFIG_PATH = "preferences.json";
var config = { ...DEFAULT_CONFIG };
var lastSimStats = "{}";
var activeUserId = null;
var runtime = {
  grantedPermissions: new Set,
  seededPresets: []
};
function getAllPresets() {
  return [...getTemplatePresets(), ...runtime.seededPresets, ...config.userPresets];
}
function getActivePreset() {
  return getAllPresets().find((preset) => preset.id === config.templateId) || getTemplatePresetById(config.templateId) || getTemplatePresetById(DEFAULT_CONFIG.templateId);
}
function sanitizeIdentifier(value) {
  if (typeof value !== "string")
    return DEFAULT_CONFIG.codeBlockIdentifier;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed)
    return DEFAULT_CONFIG.codeBlockIdentifier;
  return trimmed.replace(/[^a-z0-9_-]/g, "") || DEFAULT_CONFIG.codeBlockIdentifier;
}
function sanitizeTagName(value) {
  if (typeof value !== "string")
    return DEFAULT_CONFIG.trackerTagName;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed)
    return DEFAULT_CONFIG.trackerTagName;
  return trimmed.replace(/[^a-z0-9_-]/g, "") || DEFAULT_CONFIG.trackerTagName;
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildTrackerFenceRegex(identifier, flags = "i") {
  const cleanIdentifier = sanitizeIdentifier(identifier);
  const escapedIdentifier = escapeRegex(cleanIdentifier);
  return new RegExp(String.raw`\`\`\`[ \t]*${escapedIdentifier}(?=[ \t\r\n]|$)[^\n\r]*\r?\n([\s\S]*?)\r?\n?\s*\`\`\``, flags);
}
function parseTagAttributes(raw) {
  const out = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1] || "";
    if (!key)
      continue;
    out[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return out;
}
function buildTrackerTagRegex(tagName, flags = "i") {
  const safeTag = escapeRegex(sanitizeTagName(tagName));
  return new RegExp(String.raw`<${safeTag}\b([^>]*)>([\s\S]*?)<\/${safeTag}>`, flags);
}
function extractSimBlock(message, identifier) {
  const re = buildTrackerFenceRegex(identifier, "i");
  const match = message.match(re);
  if (!match)
    return null;
  return match[1]?.trim() || null;
}
function extractTrackerTag(message, tagName, identifier) {
  const re = buildTrackerTagRegex(tagName, "ig");
  const cleanIdentifier = sanitizeIdentifier(identifier);
  let match;
  while ((match = re.exec(message)) !== null) {
    const attrs = parseTagAttributes(match[1] || "");
    const typeAttr = sanitizeIdentifier(attrs.type || "");
    if (typeAttr && typeAttr !== cleanIdentifier)
      continue;
    return (match[2] || "").trim() || null;
  }
  return null;
}
function extractTrackerPayloadFromMessage(message) {
  return extractTrackerTag(message, config.trackerTagName, config.codeBlockIdentifier) || extractSimBlock(message, config.codeBlockIdentifier);
}
function sanitizeTrackerFormat(value) {
  return value === "yaml" ? "yaml" : "json";
}
function sanitizeTemplateId(value) {
  if (typeof value !== "string")
    return DEFAULT_CONFIG.templateId;
  const trimmed = value.trim();
  return trimmed || DEFAULT_CONFIG.templateId;
}
function sanitizeRetainCount(value) {
  if (typeof value !== "number" || Number.isNaN(value))
    return DEFAULT_CONFIG.retainTrackerCount;
  return Math.max(0, Math.min(20, Math.floor(value)));
}
function sanitizePresetArray(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((item) => item && typeof item === "object").map((item, idx) => {
    const p = item;
    return {
      id: typeof p.id === "string" && p.id ? p.id : `user-preset-${idx}`,
      templateName: typeof p.templateName === "string" ? p.templateName : `User Preset ${idx + 1}`,
      templateAuthor: typeof p.templateAuthor === "string" ? p.templateAuthor : "User",
      htmlTemplate: typeof p.htmlTemplate === "string" ? p.htmlTemplate : "",
      sysPrompt: typeof p.sysPrompt === "string" ? p.sysPrompt : "",
      displayInstructions: typeof p.displayInstructions === "string" ? p.displayInstructions : "",
      customFields: Array.isArray(p.customFields) ? p.customFields : [],
      extSettings: p.extSettings && typeof p.extSettings === "object" ? p.extSettings : {}
    };
  });
}
function sanitizeSinglePreset(value, fallbackId) {
  if (!value || typeof value !== "object")
    return null;
  const p = value;
  return {
    id: typeof p.id === "string" && p.id ? p.id : fallbackId,
    templateName: typeof p.templateName === "string" && p.templateName ? p.templateName : fallbackId,
    templateAuthor: typeof p.templateAuthor === "string" ? p.templateAuthor : "Seeded",
    htmlTemplate: typeof p.htmlTemplate === "string" ? p.htmlTemplate : "",
    sysPrompt: typeof p.sysPrompt === "string" ? p.sysPrompt : "",
    displayInstructions: typeof p.displayInstructions === "string" ? p.displayInstructions : "",
    inlineTemplatesEnabled: typeof p.inlineTemplatesEnabled === "boolean" ? p.inlineTemplatesEnabled : false,
    inlineTemplates: Array.isArray(p.inlineTemplates) ? p.inlineTemplates : [],
    customFields: Array.isArray(p.customFields) ? p.customFields : [],
    extSettings: p.extSettings && typeof p.extSettings === "object" ? p.extSettings : {}
  };
}
function sanitizeInlinePacks(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((item) => item && typeof item === "object");
}
function sanitizeInlineEnabled(value) {
  return typeof value === "boolean" ? value : DEFAULT_CONFIG.enableInlineTemplates;
}
function sanitizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function sanitizeStr(value, fallback) {
  return typeof value === "string" ? value.trim() : fallback;
}
function sanitizeMessageCount(value) {
  if (typeof value !== "number" || Number.isNaN(value))
    return DEFAULT_CONFIG.secondaryLLMMessageCount;
  return Math.max(1, Math.min(50, Math.floor(value)));
}
function sanitizeTemperature(value) {
  if (typeof value !== "number" || Number.isNaN(value))
    return DEFAULT_CONFIG.secondaryLLMTemperature;
  return Math.max(0, Math.min(2, Math.round(value * 100) / 100));
}
function hasPermission(name) {
  return runtime.grantedPermissions.has(name);
}
async function trackEvent(eventName, payload, options) {
  if (!hasPermission("event_tracking"))
    return;
  try {
    await spindle.events.track(eventName, payload, options);
  } catch {}
}
function readMessageContext(payload) {
  if (!payload || typeof payload !== "object") {
    return { chatId: null, messageId: null, content: null };
  }
  const obj = payload;
  const nestedMessage = obj.message && typeof obj.message === "object" ? obj.message : {};
  const nestedChat = obj.chat && typeof obj.chat === "object" ? obj.chat : {};
  const chatIdCandidates = [obj.chatId, obj.chat_id, nestedMessage.chatId, nestedMessage.chat_id, nestedChat.id, obj.id];
  const messageIdCandidates = [obj.messageId, obj.message_id, nestedMessage.id, nestedMessage.messageId, obj.id];
  const content = (typeof nestedMessage.content === "string" ? nestedMessage.content : null) || (typeof obj.content === "string" ? obj.content : null);
  const chatId = chatIdCandidates.find((value) => typeof value === "string" && value.trim().length > 0);
  const messageId = messageIdCandidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return {
    chatId: chatId || null,
    messageId: messageId || null,
    content
  };
}
function parseTrackerPayload(raw) {
  const cleaned = raw.trim().replace(/([\s:[,{])\+(\d+(?:\.\d+)?)([\s,}\]\n\r]|$)/g, "$1$2$3");
  if (!cleaned)
    return null;
  try {
    const json = JSON.parse(cleaned);
    if (json && typeof json === "object")
      return json;
  } catch {}
  try {
    const yaml = $parse(cleaned);
    if (yaml && typeof yaml === "object")
      return yaml;
  } catch {
    return null;
  }
  return null;
}
function setDeep(target, path, value) {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0)
    return;
  let cursor = target;
  for (let i = 0;i < parts.length - 1; i += 1) {
    const key = parts[i];
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}
function inferExampleValue(key, description) {
  const k = key.toLowerCase();
  const d = description.toLowerCase();
  if (k === "name")
    return "Character Name";
  if (k.includes("date") && k.includes("time"))
    return "YYYY-MM-DD HH:MM";
  if (k.includes("date"))
    return "YYYY-MM-DD";
  if (k.includes("time"))
    return "HH:MM";
  if (k.includes("bg") || k.includes("color"))
    return "HEX_COLOR";
  if (k.includes("icon") || k.includes("status") || k.includes("thought"))
    return "";
  if (k.includes("inactive") || k.includes("preg") || d.includes("true/false") || d.includes("boolean"))
    return false;
  if (d.includes("array") || k.endsWith("s") || d.includes("[{")) {
    if (k.includes("connection"))
      return [{ name: "Target", affinity: 0 }];
    return [];
  }
  if (k.includes("ap") || k.includes("dp") || k.includes("tp") || k.includes("cp") || k.includes("affection") || k.includes("desire") || k.includes("trust") || k.includes("contempt") || k.includes("affinity") || k.includes("health") || k.includes("days") || k.includes("level") || k.includes("turn") || d.includes("0-") || d.includes("number")) {
    return 0;
  }
  return "";
}
function buildTemplateExampleData() {
  const preset = getActivePreset();
  const fields = Array.isArray(preset.customFields) ? preset.customFields : [];
  const worldData = {
    current_date: "YYYY-MM-DD",
    current_time: "HH:MM"
  };
  const character = {
    name: "Character Name"
  };
  for (const field of fields) {
    const key = typeof field?.key === "string" ? field.key.trim() : "";
    if (!key)
      continue;
    const description = typeof field?.description === "string" ? field.description : "";
    const sample = inferExampleValue(key, description);
    if (key.startsWith("worldData.")) {
      setDeep(worldData, key.slice("worldData.".length), sample);
      continue;
    }
    const normalizedKey = key.replace(/^character\./i, "").replace(/^characters\[\]\./i, "");
    if (!normalizedKey || normalizedKey.toLowerCase() === "name")
      continue;
    setDeep(character, normalizedKey, sample);
  }
  return {
    worldData,
    characters: [character]
  };
}
function buildExampleTrackerBlock(format, identifier) {
  const data = buildTemplateExampleData();
  return formatTrackerPayload(data, format, identifier);
}
function formatTrackerPayload(data, format, identifier) {
  const tagName = sanitizeTagName(config.trackerTagName);
  const safeIdentifier = sanitizeIdentifier(identifier);
  const body = format === "yaml" ? $stringify(data).trimEnd() : JSON.stringify(data, null, 2);
  return `<${tagName} type="${safeIdentifier}">
${body}
</${tagName}>`;
}
function buildCommandResponse(payload) {
  return {
    type: "command_result",
    payload
  };
}
function makeStarterTrackerBlock() {
  return buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
}
function replaceTrackerBlock(content, identifier, replacementBlock) {
  const tagRe = buildTrackerTagRegex(config.trackerTagName, "ig");
  const desiredType = sanitizeIdentifier(identifier);
  let replaced = false;
  const withTag = content.replace(tagRe, (full, attrsRaw) => {
    const attrs = parseTagAttributes(String(attrsRaw || ""));
    const foundType = sanitizeIdentifier(attrs.type || "");
    if (foundType && foundType !== desiredType)
      return full;
    if (replaced)
      return full;
    replaced = true;
    return replacementBlock;
  });
  if (replaced)
    return withTag;
  const re = buildTrackerFenceRegex(identifier, "i");
  return withTag.replace(re, replacementBlock);
}
async function mutateChatForCommand(command, arg1, ctx) {
  if (!hasPermission("chat_mutation") || !ctx.chatId)
    return null;
  let messages = [];
  try {
    messages = await spindle.chat.getMessages(ctx.chatId);
  } catch {
    return null;
  }
  let latestTrackerMessage = null;
  for (let i = messages.length - 1;i >= 0; i -= 1) {
    const msg = messages[i];
    if (extractTrackerPayloadFromMessage(msg.content)) {
      latestTrackerMessage = msg;
      break;
    }
  }
  if (command === "/sst-add") {
    const target = messages.findLast((msg) => msg.role === "assistant") || null;
    if (!target) {
      return {
        command: "sst-add",
        ok: false,
        message: "No assistant message found to append tracker tag.",
        mode: "chat_mutation"
      };
    }
    if (extractTrackerPayloadFromMessage(target.content)) {
      return {
        command: "sst-add",
        ok: false,
        message: "Latest assistant message already contains a tracker tag.",
        mode: "chat_mutation"
      };
    }
    const block = makeStarterTrackerBlock();
    const updatedContent2 = `${target.content.trimEnd()}

${block}`;
    await spindle.chat.updateMessage(ctx.chatId, target.id, { content: updatedContent2 });
    await trackEvent("sst.command.add", { mode: "chat_mutation" }, { chatId: ctx.chatId });
    return {
      command: "sst-add",
      ok: true,
      message: "Added starter tracker tag to latest assistant message.",
      block,
      mode: "chat_mutation"
    };
  }
  if (!latestTrackerMessage) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "No tracker tag found in current chat.",
      mode: "chat_mutation"
    };
  }
  const raw = extractTrackerPayloadFromMessage(latestTrackerMessage.content);
  if (!raw) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "Latest tracker tag could not be read.",
      mode: "chat_mutation"
    };
  }
  const parsed = parseTrackerPayload(raw);
  if (!parsed) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "Latest tracker tag is invalid and cannot be rewritten.",
      mode: "chat_mutation"
    };
  }
  const targetFormat = command === "/sst-convert" ? arg1 === "yaml" ? "yaml" : arg1 === "json" ? "json" : config.trackerFormat : config.trackerFormat;
  const replacement = formatTrackerPayload(parsed, targetFormat, config.codeBlockIdentifier);
  const updatedContent = replaceTrackerBlock(latestTrackerMessage.content, config.codeBlockIdentifier, replacement);
  await spindle.chat.updateMessage(ctx.chatId, latestTrackerMessage.id, { content: updatedContent });
  lastSimStats = targetFormat === "yaml" ? $stringify(parsed) : JSON.stringify(parsed, null, 2);
  pushMacroValues();
  await trackEvent(command === "/sst-convert" ? "sst.command.convert" : "sst.command.regen", { mode: "chat_mutation", format: targetFormat }, { chatId: ctx.chatId });
  return {
    command: command.replace("/", ""),
    ok: true,
    message: command === "/sst-convert" ? `Converted latest tracker to ${targetFormat.toUpperCase()} and updated chat message.` : "Rebuilt latest tracker tag in preferred format and updated chat message.",
    block: replacement,
    mode: "chat_mutation"
  };
}
async function handleSlashCommand(content, ctx) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/sst-"))
    return null;
  const [commandRaw, arg1] = trimmed.split(/\s+/);
  const command = commandRaw;
  if (!["/sst-add", "/sst-convert", "/sst-regen"].includes(command)) {
    return buildCommandResponse({
      command: commandRaw.replace("/", ""),
      ok: false,
      message: "Unknown SST command. Supported: /sst-add, /sst-convert, /sst-regen",
      mode: "fallback"
    });
  }
  const chatResult = await mutateChatForCommand(command, arg1, ctx);
  if (chatResult) {
    return buildCommandResponse(chatResult);
  }
  if (command === "/sst-convert") {
    const target = arg1 === "yaml" ? "yaml" : arg1 === "json" ? "json" : config.trackerFormat;
    if (!lastSimStats || lastSimStats === "{}") {
      return buildCommandResponse({
        command: "sst-convert",
        ok: false,
        message: "No tracker tag found yet.",
        mode: "fallback"
      });
    }
    const parsed2 = parseTrackerPayload(lastSimStats);
    if (!parsed2) {
      return buildCommandResponse({
        command: "sst-convert",
        ok: false,
        message: "Latest tracker tag is invalid and cannot be converted.",
        mode: "fallback"
      });
    }
    const block2 = formatTrackerPayload(parsed2, target, config.codeBlockIdentifier);
    lastSimStats = target === "yaml" ? $stringify(parsed2) : JSON.stringify(parsed2, null, 2);
    pushMacroValues();
    await trackEvent("sst.command.convert", { mode: "fallback", format: target }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    return buildCommandResponse({
      command: "sst-convert",
      ok: true,
      message: `Converted latest tracker to ${target.toUpperCase()}.`,
      block: block2,
      mode: "fallback"
    });
  }
  if (command === "/sst-add") {
    const block2 = makeStarterTrackerBlock();
    await trackEvent("sst.command.add", { mode: "fallback" }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    return buildCommandResponse({
      command: "sst-add",
      ok: true,
      message: "Generated a starter tracker tag.",
      block: block2,
      mode: "fallback"
    });
  }
  if (!lastSimStats || lastSimStats === "{}") {
    return buildCommandResponse({
      command: "sst-regen",
      ok: false,
      message: "No tracker tag to regenerate yet. Use /sst-add first.",
      mode: "fallback"
    });
  }
  const parsed = parseTrackerPayload(lastSimStats);
  if (!parsed) {
    return buildCommandResponse({
      command: "sst-regen",
      ok: false,
      message: "Latest tracker is invalid and cannot be regenerated.",
      mode: "fallback"
    });
  }
  const block = formatTrackerPayload(parsed, config.trackerFormat, config.codeBlockIdentifier);
  await trackEvent("sst.command.regen", { mode: "fallback", format: config.trackerFormat }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
  return buildCommandResponse({
    command: "sst-regen",
    ok: true,
    message: "Rebuilt latest tracker tag in preferred format.",
    block,
    mode: "fallback"
  });
}
function stripOldTrackerBlocks(content, identifier, keepNewest) {
  if (!content || keepNewest < 0)
    return content;
  const fenceRe = buildTrackerFenceRegex(identifier, "gi");
  const tagRe = buildTrackerTagRegex(config.trackerTagName, "gi");
  const blocks = [];
  for (const match of content.matchAll(fenceRe)) {
    const text = match[0] || "";
    const start = match.index ?? -1;
    if (start < 0 || !text)
      continue;
    blocks.push({ start, end: start + text.length, text });
  }
  for (const match of content.matchAll(tagRe)) {
    const text = match[0] || "";
    const attrs = parseTagAttributes(match[1] || "");
    const foundType = sanitizeIdentifier(attrs.type || "");
    const desiredType = sanitizeIdentifier(identifier);
    if (foundType && foundType !== desiredType)
      continue;
    const start = match.index ?? -1;
    if (start < 0 || !text)
      continue;
    blocks.push({ start, end: start + text.length, text });
  }
  blocks.sort((a, b) => a.start - b.start);
  const matches = blocks;
  if (matches.length <= keepNewest || keepNewest === 0) {
    if (keepNewest === 0) {
      let wiped = content.replace(fenceRe, "");
      wiped = wiped.replace(tagRe, (full, attrsRaw) => {
        const attrs = parseTagAttributes(String(attrsRaw || ""));
        const foundType = sanitizeIdentifier(attrs.type || "");
        const desiredType = sanitizeIdentifier(identifier);
        if (foundType && foundType !== desiredType)
          return full;
        return "";
      });
      return wiped.replace(/\n\s*\n\s*\n/g, `

`).trim();
    }
    return content;
  }
  const removeCount = matches.length - keepNewest;
  const removeIndexes = new Set;
  for (let i = 0;i < removeCount; i += 1)
    removeIndexes.add(i);
  let out = "";
  let cursor = 0;
  for (let i = 0;i < matches.length; i += 1) {
    const block = matches[i];
    out += content.slice(cursor, block.start);
    if (!removeIndexes.has(i))
      out += block.text;
    cursor = block.end;
  }
  out += content.slice(cursor);
  return out.replace(/\n\s*\n\s*\n/g, `

`).trim();
}
async function loadConfig() {
  try {
    const parsed = await spindle.userStorage.getJson(CONFIG_PATH, { fallback: { ...DEFAULT_CONFIG }, userId: activeUserId || undefined });
    config = {
      trackerTagName: sanitizeTagName(parsed.trackerTagName),
      codeBlockIdentifier: sanitizeIdentifier(parsed.codeBlockIdentifier),
      hideSimBlocks: sanitizeBool(parsed.hideSimBlocks, DEFAULT_CONFIG.hideSimBlocks),
      templateId: sanitizeTemplateId(parsed.templateId),
      trackerFormat: sanitizeTrackerFormat(parsed.trackerFormat),
      retainTrackerCount: sanitizeRetainCount(parsed.retainTrackerCount),
      enableInlineTemplates: sanitizeInlineEnabled(parsed.enableInlineTemplates),
      userPresets: sanitizePresetArray(parsed.userPresets),
      inlinePacks: sanitizeInlinePacks(parsed.inlinePacks),
      useSecondaryLLM: sanitizeBool(parsed.useSecondaryLLM, DEFAULT_CONFIG.useSecondaryLLM),
      secondaryLLMConnectionId: sanitizeStr(parsed.secondaryLLMConnectionId, DEFAULT_CONFIG.secondaryLLMConnectionId),
      secondaryLLMModel: sanitizeStr(parsed.secondaryLLMModel, DEFAULT_CONFIG.secondaryLLMModel),
      secondaryLLMMessageCount: sanitizeMessageCount(parsed.secondaryLLMMessageCount),
      secondaryLLMTemperature: sanitizeTemperature(parsed.secondaryLLMTemperature),
      secondaryLLMStripHTML: sanitizeBool(parsed.secondaryLLMStripHTML, DEFAULT_CONFIG.secondaryLLMStripHTML)
    };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  pushMacroValues();
}
async function loadSeededTemplatePresets() {
  const seeded = [];
  try {
    const templatesRoot = "templates";
    const hasTemplatesDir = await spindle.storage.exists(templatesRoot);
    if (!hasTemplatesDir) {
      runtime.seededPresets = [];
      return;
    }
    const visited = new Set;
    const jsonPaths = new Set;
    const toStoragePath = (entry, base) => {
      const normalized = entry.replace(/^\/+/, "").replace(/\\/g, "/");
      if (!normalized)
        return base;
      if (normalized === base || normalized.startsWith(`${base}/`))
        return normalized;
      return `${base}/${normalized}`;
    };
    const walk = async (dirPath) => {
      if (visited.has(dirPath))
        return;
      visited.add(dirPath);
      const entries = await spindle.storage.list(dirPath);
      for (const entry of entries) {
        const fullPath = toStoragePath(entry, dirPath);
        try {
          const stat = await spindle.storage.stat(fullPath);
          if (!stat.exists)
            continue;
          if (stat.isDirectory) {
            await walk(fullPath);
            continue;
          }
          if (stat.isFile && fullPath.toLowerCase().endsWith(".json")) {
            jsonPaths.add(fullPath);
          }
        } catch {}
      }
    };
    await walk(templatesRoot);
    for (const path of jsonPaths) {
      try {
        const stat = await spindle.storage.stat(path);
        if (!stat.exists || !stat.isFile)
          continue;
        const fileName = path.split("/").pop() || "seeded-template";
        const fileId = fileName.replace(/\.json$/i, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
        const parsed = await spindle.storage.getJson(path, { fallback: {} });
        const preset = sanitizeSinglePreset(parsed, fileId);
        if (preset && preset.htmlTemplate) {
          seeded.push(preset);
        }
      } catch {}
    }
  } catch {}
  runtime.seededPresets = seeded;
}
async function saveConfig() {
  await spindle.userStorage.setJson(CONFIG_PATH, config, { indent: 2, userId: activeUserId || undefined });
}
spindle.on("MESSAGE_SENT", (payload) => {
  (async () => {
    const ctx = readMessageContext(payload);
    const message = ctx.content;
    if (typeof message !== "string")
      return;
    const commandResult = await handleSlashCommand(message, ctx);
    if (commandResult) {
      spindle.sendToFrontend(commandResult);
      await trackEvent("sst.command.result", {
        command: commandResult.payload.command,
        ok: commandResult.payload.ok,
        mode: commandResult.payload.mode || "fallback"
      }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    }
    const sim = extractTrackerPayloadFromMessage(message);
    if (sim) {
      lastSimStats = sim;
      pushMacroValues();
      await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    }
  })();
});
spindle.on("MESSAGE_EDITED", (payload) => {
  (async () => {
    const ctx = readMessageContext(payload);
    if (typeof ctx.content !== "string")
      return;
    const sim = extractTrackerPayloadFromMessage(ctx.content);
    if (!sim)
      return;
    lastSimStats = sim;
    pushMacroValues();
    await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier, source: "message_edited" }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
  })();
});
spindle.on("MESSAGE_TAG_INTERCEPTED", (payload) => {
  (async () => {
    if (!payload || typeof payload !== "object")
      return;
    const obj = payload;
    const tagName = typeof obj.tagName === "string" ? sanitizeTagName(obj.tagName) : "";
    if (tagName !== sanitizeTagName(config.trackerTagName))
      return;
    const attrs = obj.attrs && typeof obj.attrs === "object" ? obj.attrs : {};
    const tagType = sanitizeIdentifier(typeof attrs.type === "string" ? attrs.type : "");
    if (tagType && tagType !== sanitizeIdentifier(config.codeBlockIdentifier))
      return;
    const content = typeof obj.content === "string" ? obj.content.trim() : "";
    if (!content)
      return;
    lastSimStats = content;
    pushMacroValues();
    await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier, source: "message_tag_intercepted" });
  })();
});
spindle.registerMacro({
  name: "sim_format",
  category: "extension:silly_sim_tracker",
  description: "Example tracker tag format",
  returnType: "string",
  handler: ""
});
spindle.registerMacro({
  name: "sim_tracker",
  category: "extension:silly_sim_tracker",
  description: "Main tracker instructions for the active template",
  returnType: "string",
  handler: ""
});
spindle.registerMacro({
  name: "last_sim_stats",
  category: "extension:silly_sim_tracker",
  description: "The latest raw tracker block seen in chat",
  returnType: "string",
  handler: ""
});
var promptMap = {
  "bento-style-tracker": getTemplatePresetById("bento-style-tracker").sysPrompt || "",
  "dating-card-template": getTemplatePresetById("dating-card-template").sysPrompt || "",
  "tactical-hud-sidebar-tabs": getTemplatePresetById("tactical-hud-sidebar-tabs").sysPrompt || ""
};
function pushMacroValues() {
  const fmt = buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
  spindle.updateMacroValue("sim_format", fmt);
  const tag = config.trackerTagName || "tracker";
  const id = config.codeBlockIdentifier || "sim";
  const base = promptMap[config.templateId] || "";
  const directive = [
    "IMPORTANT OUTPUT FORMAT:",
    "Do not emit markdown code fences for tracker data.",
    "Emit a single XML block using this exact wrapper:",
    `<${tag} type="${id}">`,
    "{...tracker JSON or YAML...}",
    `</${tag}>`,
    "Narrative text must remain outside the tracker tag."
  ].join(`
`);
  const simTracker = base ? directive + `

` + base.replace(/\{\{sim_format\}\}/g, fmt) : directive + `

` + fmt;
  spindle.updateMacroValue("sim_tracker", simTracker);
  spindle.updateMacroValue("last_sim_stats", lastSimStats || "{}");
}
var secondaryGenerationInProgress = false;
function stripStructuralHTML(text) {
  if (!text)
    return text;
  const tagsToRemove = [
    "div",
    "details",
    "summary",
    "section",
    "article",
    "aside",
    "nav",
    "header",
    "footer",
    "main",
    "figure",
    "figcaption",
    "blockquote",
    "pre",
    "code",
    "script",
    "style",
    "iframe",
    "object",
    "embed"
  ];
  let stripped = text;
  for (const tag of tagsToRemove) {
    stripped = stripped.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    stripped = stripped.replace(new RegExp(`<${tag}[^>]*\\/>`, "gi"), "");
  }
  return stripped.replace(/\s+/g, " ").trim();
}
async function generateTrackerWithSecondaryLLM(chatId, targetMessageId) {
  if (secondaryGenerationInProgress)
    return;
  if (!config.useSecondaryLLM)
    return;
  if (!hasPermission("generation")) {
    spindle.log.warn("Secondary LLM generation requires 'generation' permission");
    return;
  }
  if (!hasPermission("chat_mutation")) {
    spindle.log.warn("Secondary LLM generation requires 'chat_mutation' permission");
    return;
  }
  secondaryGenerationInProgress = true;
  spindle.sendToFrontend({ type: "secondary_generation_started" });
  try {
    const messages = await spindle.chat.getMessages(chatId);
    if (!messages.length)
      return;
    const targetMessage = messages.find((m) => m.id === targetMessageId);
    if (!targetMessage || targetMessage.role !== "assistant")
      return;
    if (extractTrackerPayloadFromMessage(targetMessage.content))
      return;
    const preset = getActivePreset();
    const systemPrompt = preset.sysPrompt || "";
    const formatExample = buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
    let processedPrompt = systemPrompt.replace(/\{\{sim_format\}\}/g, formatExample);
    const tagName = sanitizeTagName(config.trackerTagName);
    const identifier = config.codeBlockIdentifier;
    const messageCount = config.secondaryLLMMessageCount;
    const recentMessages = messages.filter((m) => m.role !== "system").slice(-messageCount);
    let previousTrackerData = null;
    for (let i = recentMessages.length - 2;i >= 0; i -= 1) {
      const payload = extractTrackerPayloadFromMessage(recentMessages[i].content);
      if (payload) {
        previousTrackerData = payload;
        break;
      }
    }
    const tagRe = buildTrackerTagRegex(tagName, "ig");
    const fenceRe = buildTrackerFenceRegex(identifier, "gi");
    const cleanedMessages = recentMessages.map((msg) => {
      let content = msg.content;
      content = content.replace(tagRe, "").trim();
      content = content.replace(fenceRe, "").trim();
      if (config.secondaryLLMStripHTML) {
        content = stripStructuralHTML(content);
      }
      return { role: msg.role, content };
    });
    let conversationText = processedPrompt + `

`;
    if (previousTrackerData) {
      conversationText += `Previous tracker state:
` + previousTrackerData + `

`;
    }
    conversationText += `Recent conversation:

`;
    for (const msg of cleanedMessages) {
      conversationText += `${msg.role === "user" ? "User" : "Character"}: ${msg.content}

`;
    }
    conversationText += `
Based on the above conversation${previousTrackerData ? " and the previous tracker state" : ""}, generate ONLY the raw ${config.trackerFormat.toUpperCase()} data (without code fences or backticks). Output ONLY the ${config.trackerFormat.toUpperCase()} structure directly, with no comments or acknowledgements of any instructions.`;
    const llmMessages = [
      { role: "user", content: conversationText }
    ];
    const parameters = {
      temperature: config.secondaryLLMTemperature
    };
    if (config.secondaryLLMModel) {
      parameters.model = config.secondaryLLMModel;
    }
    spindle.log.info("Starting secondary LLM generation...");
    const result = await spindle.generate.raw({
      type: "raw",
      messages: llmMessages,
      parameters,
      connection_id: config.secondaryLLMConnectionId || undefined,
      userId: activeUserId || undefined
    });
    const resultObj = result;
    const generatedText = typeof resultObj.content === "string" ? resultObj.content : "";
    if (!generatedText) {
      spindle.log.warn("Secondary LLM returned empty response");
      spindle.sendToFrontend({ type: "secondary_generation_error", message: "Empty response from LLM" });
      return;
    }
    let sanitized = generatedText.trim();
    sanitized = sanitized.replace(/^```(?:json|yaml|yml)\s*/i, "");
    sanitized = sanitized.replace(/^```\s*/, "");
    sanitized = sanitized.replace(/\s*```\s*$/, "");
    sanitized = sanitized.trim();
    const parsed = parseTrackerPayload(sanitized);
    if (!parsed) {
      spindle.log.warn("Secondary LLM response could not be parsed as valid tracker data");
      spindle.sendToFrontend({ type: "secondary_generation_error", message: "LLM response was not valid tracker data" });
      return;
    }
    const trackerBlock = formatTrackerPayload(parsed, config.trackerFormat, config.codeBlockIdentifier);
    const updatedContent = `${targetMessage.content.trimEnd()}

${trackerBlock}`;
    await spindle.chat.updateMessage(chatId, targetMessageId, { content: updatedContent });
    lastSimStats = config.trackerFormat === "yaml" ? $stringify(parsed) : JSON.stringify(parsed, null, 2);
    pushMacroValues();
    spindle.log.info("Secondary LLM generation complete");
    await trackEvent("sst.secondary_generation.complete", {
      connectionId: config.secondaryLLMConnectionId,
      model: config.secondaryLLMModel
    }, { chatId });
    spindle.sendToFrontend({
      type: "secondary_generation_complete",
      messageId: targetMessageId,
      content: updatedContent
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.error(`Secondary LLM generation failed: ${message}`);
    spindle.sendToFrontend({ type: "secondary_generation_error", message });
    await trackEvent("sst.secondary_generation.failed", { error: message }, { level: "error" });
  } finally {
    secondaryGenerationInProgress = false;
  }
}
spindle.on("GENERATION_ENDED", (payload) => {
  (async () => {
    if (!config.useSecondaryLLM || secondaryGenerationInProgress)
      return;
    if (!hasPermission("generation") || !hasPermission("chat_mutation"))
      return;
    const ctx = readMessageContext(payload);
    if (!ctx.chatId)
      return;
    let chatMessages;
    try {
      chatMessages = await spindle.chat.getMessages(ctx.chatId);
    } catch {
      return;
    }
    const latestAssistant = chatMessages.findLast((m) => m.role === "assistant");
    if (!latestAssistant)
      return;
    if (extractTrackerPayloadFromMessage(latestAssistant.content))
      return;
    await generateTrackerWithSecondaryLLM(ctx.chatId, latestAssistant.id);
  })();
});
try {
  spindle.registerInterceptor(async (messages) => {
    const keepNewest = config.retainTrackerCount;
    if (keepNewest < 0)
      return messages;
    const updated = messages.map((message) => {
      if (!message || typeof message.content !== "string")
        return message;
      return {
        ...message,
        content: stripOldTrackerBlocks(message.content, config.codeBlockIdentifier, keepNewest)
      };
    });
    return updated;
  }, 90);
  spindle.log.info("Interceptor registered");
} catch {
  spindle.log.warn("Interceptor unavailable (permission not granted yet)");
}
async function initGrantedPermissions() {
  try {
    const granted = await spindle.permissions.getGranted();
    runtime.grantedPermissions = new Set(granted);
    spindle.log.info(`Granted permissions: ${granted.join(", ") || "none"}`);
  } catch {
    runtime.grantedPermissions = new Set;
    spindle.log.warn("Unable to read granted permissions");
  }
}
async function refreshGrantedPermissions() {
  try {
    const granted = await spindle.permissions.getGranted();
    runtime.grantedPermissions = new Set(granted);
  } catch {}
}
async function getEphemeralPoolStatusSafe() {
  if (!hasPermission("ephemeral_storage"))
    return null;
  try {
    return await spindle.ephemeral.getPoolStatus();
  } catch {
    return null;
  }
}
async function sendConfigState() {
  await refreshGrantedPermissions();
  await loadSeededTemplatePresets();
  spindle.sendToFrontend({
    type: "config",
    config,
    grantedPermissions: Array.from(runtime.grantedPermissions),
    requestedPermissions: spindle.manifest.permissions || [],
    seededPresets: runtime.seededPresets,
    ephemeralPoolStatus: await getEphemeralPoolStatusSafe()
  });
}
async function handleImportPresetFile(payload) {
  const text = typeof payload.text === "string" ? payload.text : "";
  const fileName = typeof payload.fileName === "string" ? payload.fileName : "import.json";
  if (!text.trim()) {
    spindle.sendToFrontend({
      type: "import_result",
      ok: false,
      message: "Import failed (empty file)."
    });
    return;
  }
  if (hasPermission("ephemeral_storage")) {
    try {
      const encoded = new TextEncoder().encode(text);
      const reservation = await spindle.ephemeral.requestBlock(encoded.byteLength, {
        ttlMs: 2 * 60 * 1000,
        reason: "sst import staging"
      });
      const path = `imports/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await spindle.ephemeral.write(path, text, {
        ttlMs: 2 * 60 * 1000,
        reservationId: reservation.reservationId
      });
      await spindle.ephemeral.releaseBlock(reservation.reservationId);
    } catch {}
  }
  let parsed;
  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== "object")
      throw new Error("invalid");
    parsed = json;
  } catch {
    spindle.sendToFrontend({
      type: "import_result",
      ok: false,
      message: "Import failed (invalid JSON)."
    });
    await trackEvent("sst.import.failed", { reason: "invalid_json", fileName }, { level: "warn" });
    return;
  }
  if (Array.isArray(parsed.inlineTemplates) && parsed.inlineTemplates.length > 0) {
    config = { ...config, inlinePacks: [...config.inlinePacks, parsed] };
    await saveConfig();
    pushMacroValues();
    await sendConfigState();
    spindle.sendToFrontend({
      type: "import_result",
      ok: true,
      message: `Imported inline pack: ${String(parsed.templateName || "Unnamed")}`
    });
    await trackEvent("sst.import.inline_pack", { fileName }, { level: "info" });
    return;
  }
  const idBase = String(parsed.templateName || "user_preset").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const preset = {
    id: `${idBase}_${Date.now()}`,
    templateName: String(parsed.templateName || "Imported Preset"),
    templateAuthor: String(parsed.templateAuthor || "User"),
    htmlTemplate: typeof parsed.htmlTemplate === "string" ? parsed.htmlTemplate : "",
    sysPrompt: typeof parsed.sysPrompt === "string" ? parsed.sysPrompt : "",
    displayInstructions: typeof parsed.displayInstructions === "string" ? parsed.displayInstructions : "",
    inlineTemplatesEnabled: typeof parsed.inlineTemplatesEnabled === "boolean" ? parsed.inlineTemplatesEnabled : false,
    inlineTemplates: Array.isArray(parsed.inlineTemplates) ? parsed.inlineTemplates : [],
    customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
    extSettings: parsed.extSettings && typeof parsed.extSettings === "object" ? parsed.extSettings : {}
  };
  config = {
    ...config,
    userPresets: [...config.userPresets, preset],
    templateId: preset.id
  };
  await saveConfig();
  pushMacroValues();
  await sendConfigState();
  spindle.sendToFrontend({
    type: "import_result",
    ok: true,
    message: `Imported preset: ${preset.templateName}`
  });
  await trackEvent("sst.import.preset", { fileName, templateId: preset.id }, { level: "info" });
}
spindle.onFrontendMessage(async (payload, userId) => {
  if (!payload || typeof payload !== "object")
    return;
  activeUserId = userId;
  const message = payload;
  if (message.type === "get_config") {
    await loadConfig();
    await sendConfigState();
    return;
  }
  if (message.type === "set_config") {
    const incoming = message.config;
    config = {
      trackerTagName: sanitizeTagName(incoming?.trackerTagName ?? config.trackerTagName),
      codeBlockIdentifier: sanitizeIdentifier(incoming?.codeBlockIdentifier ?? config.codeBlockIdentifier),
      hideSimBlocks: sanitizeBool(incoming?.hideSimBlocks ?? config.hideSimBlocks, config.hideSimBlocks),
      templateId: sanitizeTemplateId(incoming?.templateId ?? config.templateId),
      trackerFormat: sanitizeTrackerFormat(incoming?.trackerFormat ?? config.trackerFormat),
      retainTrackerCount: sanitizeRetainCount(incoming?.retainTrackerCount ?? config.retainTrackerCount),
      enableInlineTemplates: sanitizeInlineEnabled(incoming?.enableInlineTemplates ?? config.enableInlineTemplates),
      userPresets: sanitizePresetArray(incoming?.userPresets ?? config.userPresets),
      inlinePacks: sanitizeInlinePacks(incoming?.inlinePacks ?? config.inlinePacks),
      useSecondaryLLM: sanitizeBool(incoming?.useSecondaryLLM ?? config.useSecondaryLLM, config.useSecondaryLLM),
      secondaryLLMConnectionId: sanitizeStr(incoming?.secondaryLLMConnectionId ?? config.secondaryLLMConnectionId, config.secondaryLLMConnectionId),
      secondaryLLMModel: sanitizeStr(incoming?.secondaryLLMModel ?? config.secondaryLLMModel, config.secondaryLLMModel),
      secondaryLLMMessageCount: sanitizeMessageCount(incoming?.secondaryLLMMessageCount ?? config.secondaryLLMMessageCount),
      secondaryLLMTemperature: sanitizeTemperature(incoming?.secondaryLLMTemperature ?? config.secondaryLLMTemperature),
      secondaryLLMStripHTML: sanitizeBool(incoming?.secondaryLLMStripHTML ?? config.secondaryLLMStripHTML, config.secondaryLLMStripHTML)
    };
    await saveConfig();
    pushMacroValues();
    await trackEvent("sst.config.updated", {
      trackerTagName: config.trackerTagName,
      templateId: config.templateId,
      trackerFormat: config.trackerFormat,
      retainTrackerCount: config.retainTrackerCount,
      hideSimBlocks: config.hideSimBlocks,
      useSecondaryLLM: config.useSecondaryLLM
    });
    await sendConfigState();
    return;
  }
  if (message.type === "get_connections") {
    if (!hasPermission("generation")) {
      spindle.log.warn("get_connections: 'generation' permission not granted");
      spindle.sendToFrontend({
        type: "connections_list",
        connections: [],
        error: "Generation permission not granted"
      });
      return;
    }
    try {
      spindle.log.info(`get_connections: requesting with userId=${activeUserId || "(none)"}`);
      const connections = await spindle.connections.list(activeUserId || undefined);
      spindle.log.info(`get_connections: received ${connections?.length ?? 0} connection(s)`);
      spindle.sendToFrontend({ type: "connections_list", connections: connections ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spindle.log.error(`get_connections failed: ${msg}`);
      spindle.sendToFrontend({ type: "connections_list", connections: [], error: msg });
    }
    return;
  }
  if (message.type === "trigger_secondary_generation") {
    const chatId = typeof message.chatId === "string" ? message.chatId : null;
    const messageId = typeof message.messageId === "string" ? message.messageId : null;
    if (chatId && messageId) {
      await generateTrackerWithSecondaryLLM(chatId, messageId);
    }
    return;
  }
  if (message.type === "import_preset_file") {
    await handleImportPresetFile(message);
  }
});
await initGrantedPermissions();
await loadConfig();
spindle.log.info("Silly Sim Tracker (Lumiverse) backend started");

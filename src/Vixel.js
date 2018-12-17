import tinycolor from 'tinycolor2';

export default class Vixel {

  static run(context) {
    this.context = context._root;
    this.context.count = this.context.geometry.count();
    this.context.run();
  }

  static Node = class Node {
    then(next) {
      if (typeof next === 'function') {
        next = new Vixel.Draw(next);
      }
      this._next = next;
      next._root = this._root || this;
      return next;
    }

    map(next) {
      if (typeof next === 'function') {
        next = new Map(next);
      } else {
        throw new Error('function must be passed to map. or use then() instead of map()');
      }
      this._next = next;
      next._root = this._root || this;
      return next;
    }

    run(context) {
      this.next(context);
      return {...context};
    }

    next(context) {
      const n = this._next;

      if (n) {
        n.run(context);
      }
    }
  }

  static Draw = class Draw extends Vixel.Node {
    constructor(func) {
      super();
      this.func = func;
    }

    run(context) {
      this.func(context);
      super.run(context);
    }
  }

  static Map = class Map extends Vixel.Node {
    constructor(func) {
      super();
      this.func = func;
    }

    run(context) {
      context.mapPixels(this.func);
      super.run(context);
    }
  }

  static RectangleFrame = class RectangleFrame {
    constructor({width, height, count, num, time, from}) {
      this.width = width || from.width;
      this.height = height || from.height;
      this.count = count === undefined ? from.count : count;
      this.time = time === undefined ? from.time : time;
      this.num = num === undefined ? from.num : num;
      this.data = from ? Buffer.from(from.data) : Buffer.alloc((this.count * 4) + 2, 0x00);
      this.data[0] = this.width;
      this.data[1] = this.height;
    }

    set({x, y, i, color}) {
      const {r, g, b} = color.toRgb();
      let pixel;

      if (i !== undefined) {
        pixel = (i * 4) + 2;
      } else {
        const rowStart = (y * this.width * 4) + 2;

        pixel = rowStart + (x * 4);
      }
      if (r !== undefined) {
        this.data[pixel + 3] = r || 0;
      }
      if (g !== undefined) {
        this.data[pixel + 2] = g || 0;
      }
      if (b !== undefined) {
        this.data[pixel + 1] = b || 0;
      }

      this.data[pixel] = 0xE0 + 0x01;
    }

    get(x, y) {
      let pixel;

      if (y === undefined) {
        pixel = (x * 4) + 2;
      } else {
        const rowStart = (y * this.width * 4) + 2;

        pixel = rowStart + (x * 4);
      }
      return tinycolor({
        r: this.data[pixel + 3],
        g: this.data[pixel + 2],
        b: this.data[pixel + 1],
        a: this.data[pixel]
      });
    }

    clone() {
      return new RectangleFrame({from: this});
    }
  }

  static Rectangle = class Rectangle extends Vixel.Node {

    constructor(config) {
      super();
      Object.assign(this, config);
    }

    count() {
      return this.width * this.height;
    }

    createFrame({num, time, from}) {
      return new Vixel.RectangleFrame({...this, num, time, count: this.count(), from});
    }
  }

  static Context = class Context extends Vixel.Node {
    constructor(config) {
      super();
      Object.assign(this, {
        color: tinycolor,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan
      },
      config,
      {
        startTime: new Date().getTime(),
        tick: 0,
        _tick: config.tick,
        geometry: new Vixel.Rectangle({width: config.size[0], height: config.size[1]}),
        size: {
          width: config.size[0],
          height: config.size[1]
        }
      });

      this.map = this.map.bind(this);
    }

    _run() {
      super.run(this);
    }

    run() {
      this.loop(this, 0);
    }

    mapPixels(func) {
      for (let y = 0; y < this.size.height; y++) {
        for (let x = 0; x < this.size.width; x++) {
          const val = this.frame.get(x, y);
          const rowStart = y * this.size.width;
          const pixelNum = rowStart + x;
          const ret = func({...this, x, y, pixelNum, val});

          if (ret) {
            this.frame.set({x, y, color: ret});
          }
        }
      }
    }

    loop(context, frameCount) {

      const frameLength = (1 / context.frameRate) * 1000;

      const startTime = new Date();

      context.prevFrame = context.frame;
      context.time = startTime.getTime() - context.startTime;
      context.num = frameCount;
      context.frame = context.geometry.createFrame({num: frameCount, time: context.time});
      context.set = context.frame.set.bind(context.frame);
      context.context = context;
      context.tick = context._tick(context);

      context._run();

      const endTime = new Date();
      const elapsed = endTime.getTime() - startTime.getTime();
      const wait = frameLength - elapsed - 1;

      setTimeout(() => {
        context.loop(context, frameCount + 1);
      }, wait);

    }
  }

  static Unmapper = class Unmapper extends Vixel.Node {
    constructor(order) {
      super();
      this.order = order;
    }

    run({size, num, frame, context}) {
      context.frame = frame.clone();
      let i = 0;

      for (let {origin, size, order} of this.order) {
        for (let n of order({origin: {x: origin[0], y: origin[1]}, size: {width: size[0], height: size[1]}})) {
          context.frame.set({...n, color: frame.get(i) });
          i = i + 1;
        }
      }
      super.run(context);
    }
  }

  static Mapper = class Mapper extends Vixel.Node {
    constructor(order) {
      super();
      this.order = order;
    }

    run({size, num, frame, context}) {
      context.frame = frame.clone();
      let i = 0;

      for (let {origin, size, order} of this.order) {
        for (let n of order({origin: {x: origin[0], y: origin[1]}, size: {width: size[0], height: size[1]}})) {
          context.frame.set({color: frame.get(n.x, n.y), i: i });
          i = i + 1;
        }
      }
      super.run(context);
    }
  }

  static ascending = function * ascending(offset, count) {
    for (let i = offset; i < offset + count ; i++) {
      yield i;
    }
  }

  static descending = function * descending(offset, count) {
    for (let i = offset + count - 1; i >= offset ; i--) {
      yield i;
    }
  }

  static leftToRight = function leftToRight(next) {
    return function * ({origin, size, partial}) {
      for (let x of Vixel.ascending(origin.x, size.width)) {
        if (next) {
          yield * next({origin, size, partial: {x}});
        } else if (partial) {
          yield {...partial, x};
        }
      }
    };
  }

  static rightToLeft = function rightToLeft(next) {
    return function * ({origin, size, partial}) {
      for (let x of Vixel.descending(origin.x, size.width)) {
        if (next) {
          yield * next({origin, size, partial: {x}});
        } else if (partial) {
          yield {...partial, x};
        }
      }
    };
  }

  static topToBottom = function topToBottom(next) {
    return function * ({origin, size, partial}) {
      for (let y of Vixel.ascending(origin.y, size.height)) {
        if (next) {
          yield * next({origin, size, partial: {y}});
        } else if (partial) {
          yield {...partial, y};
        }
      }
    };
  }

  static bottomToTop = function bottomToTop(next) {
    return function * ({origin, size, partial}) {
      for (let y of Vixel.descending(origin.y, size.height)) {
        if (next) {
          yield * next({origin, size, partial: {y}});
        } else if (partial) {
          yield {...partial, y};
        }
      }
    };
  }

  static alternating = function alternating(next1, next2) {
    let even = true;

    return function * ({origin, size, partial}) {
      const isEven = even;

      even = !even;
      const next = isEven ? next1 : next2;

      yield* next({origin, size, partial});
    };
  }

}

export const Node = Vixel.Node;

import _ from 'underscore';

// ============ Private methods --------------------------------------------------------------------------

/**
 * Regular expression used to split event strings.
 * @type {RegExp}
 */
const r_EVENT_SPLITTER = /\s+/;

/**
 * Iterates over the standard `event, callback` (as well as the fancy multiple space-separated events `"change blur",
 * callback` and jQuery-style event maps `{event: callback}`).
 *
 * @param {function} iteratee     - Event operation to invoke.
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>} events - Event object
 * @param {string|object} name    - A single event name, compound event names, or a hash of event names.
 * @param {function} callback     - Event callback function
 * @param {object} opts           - Optional parameters
 * @returns {*}
 */
const f_EVENTS_API = (iteratee, events, name, callback, opts) => {
  let i = 0, names;
  if (name && typeof name === 'object') {
    // Handle event maps.
    if (callback !== void 0 && 'context' in opts && opts.context === void 0) {
      opts.context = callback;
    }
    for (names = _.keys(name); i < names.length; i++) {
      events = f_EVENTS_API(iteratee, events, names[i], name[names[i]], opts);
    }
  } else if (name && r_EVENT_SPLITTER.test(name)) {
    // Handle space separated event names by delegating them individually.
    for (names = name.split(r_EVENT_SPLITTER); i < names.length; i++) {
      events = iteratee(events, names[i], callback, opts);
    }
  } else {
    // Finally, standard events.
    events = iteratee(events, name, callback, opts);
  }
  return events;
};

/**
 * Guard the `listening` argument from the public API.
 *
 * @param {Events}   obj      - The Events instance
 * @param {string}   name     - Event name
 * @param {function} callback - Event callback
 * @param {object}   context  - Event context
 * @param {Object.<{obj: object, objId: string, id: string, listeningTo: object, count: number}>} listening -
 *                              Listening object
 * @returns {*}
 */
const f_INTERNAL_ON = (obj, name, callback, context, listening) => {
  obj._events = f_EVENTS_API(f_ON_API, obj._events || {}, name, callback, { context, ctx: obj, listening });

  if (listening) {
    const listeners = obj._listeners || (obj._listeners = {});
    listeners[listening.id] = listening;
  }

  return obj;
};

/**
 * The reducing API that removes a callback from the `events` object.
 *
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>} events - Events object
 * @param {string} name         - Event name
 * @param {function} callback   - Event callback
 * @param {object} options      - Optional parameters
 * @returns {*}
 */
const f_OFF_API = (events, name, callback, options) => {
  if (!events) { return; }

  let i = 0, listening;
  const context = options.context, listeners = options.listeners;

  // Delete all events listeners and "drop" events.
  if (!name && !callback && !context) {
    const ids = _.keys(listeners);
    for(; i < ids.length; i++) {
      listening = listeners[ids[i]];
      delete listeners[listening.id];
      delete listening.listeningTo[listening.objId];
    }
    return;
  }

  const names = name ? [name] : _.keys(events);
  for(; i < names.length; i++) {
    name = names[i];
    const handlers = events[name];

    // Bail out if there are no events stored
    if (!handlers) { break; }

    // Replace events if there are any remaining. Otherwise, clean up.
    const remaining = [];
    for (let j = 0; j < handlers.length; j++) {
      const handler = handlers[j];
      if (callback && callback !== handler.callback &&
        callback !== handler.callback._callback || context && context !== handler.context) {
        remaining.push(handler);
      } else {
        listening = handler.listening;
        if (listening && --listening.count === 0) {
          delete listeners[listening.id];
          delete listening.listeningTo[listening.objId];
        }
      }
    }

    // Update tail event if the list has any events.  Otherwise, clean up.
    if (remaining.length) {
      events[name] = remaining;
    } else {
      delete events[name];
    }
  }
  if (_.size(events)) { return events; }
};

/**
 * The reducing API that adds a callback to the `events` object.
 *
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>} events  - Events object
 * @param {string} name         - Event name
 * @param {function} callback   - Event callback
 * @param {object} options      - Optional parameters
 * @returns {*}
 */
const f_ON_API = (events, name, callback, options) => {
  if (callback) {
    const handlers = events[name] || (events[name] = []);
    const context = options.context, ctx = options.ctx, listening = options.listening;

    if (listening) { listening.count++; }

    handlers.push({ callback, context, ctx: context || ctx, listening });
  }
  return events;
};

/**
 * Reduces the event callbacks into a map of `{event: onceWrapper}`. `offer` unbinds the `onceWrapper` after
 * it has been called.
 *
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>} map - Events object
 * @param {string} name       - Event name
 * @param {function} callback - Event callback
 * @param {function} offer    - Function to invoke after event has been triggered once; `off()`
 * @returns {*}
 */
const f_ONCE_MAP = (map, name, callback, offer) => {
  if (callback) {
    const once = map[name] = _.once(function() {
      offer(name, once);
      callback.apply(this, arguments);
    });
    once._callback = callback;
  }
  return map;
};

/**
 * Handles triggering the appropriate event callbacks.
 *
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>} objEvents - Events object
 * @param {string}   name  - Event name
 * @param {function} cb    - Event callback
 * @param {Array<*>} args  - Event arguments
 * @returns {*}
 */
const f_TRIGGER_API = (objEvents, name, cb, args) => {
  if (objEvents) {
    const events = objEvents[name];
    let allEvents = objEvents.all;
    if (events && allEvents) {
      allEvents = allEvents.slice();
    }
    if (events) {
      f_TRIGGER_EVENTS(events, args);
    }
    if (allEvents) {
      f_TRIGGER_EVENTS(allEvents, [name].concat(args));
    }
  }
};

/**
 * A difficult-to-believe, but optimized internal dispatch function for triggering events. Tries to keep the usual
 * cases speedy (most internal Backbone events have 3 arguments).
 *
 * @param {Object.<{callback: function, context: object, ctx: object, listening:{}}>}  events - events array
 * @param {Array<*>} args - event argument array
 */
const f_TRIGGER_EVENTS = (events, args) => {
  let ev, i = -1;
  const a1 = args[0], a2 = args[1], a3 = args[2], l = events.length;

  switch (args.length) {
    case 0:
      while (++i < l) { (ev = events[i]).callback.call(ev.ctx); }
      return;
    case 1:
      while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1); }
      return;
    case 2:
      while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1, a2); }
      return;
    case 3:
      while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); }
      return;
    default:
      while (++i < l) { (ev = events[i]).callback.apply(ev.ctx, args); }
      return;
  }
};

/**
 * Legao.Events - Provides the ability to bind and trigger custom named events.
 * ---------------
 *
 * @example
 *
 * import Legao from 'legao';
 *
 * export default new Legao.Events();
 *
 * This module / Events instance can then be imported by full path or if consuming in a modular runtime by creating
 * a mapped path to it.
 *
 */
export default class Events {
  /** */
  constructor() {}

  /**
   * Delegates to `on`.
   *
   * @returns {*}
   */
  bind() {
    return this.on(...arguments);
  }

  /**
   * Tell an object to listen to a particular event on an other object. The advantage of using this form, instead of
   * other.on(event, callback, object), is that listenTo allows the object to keep track of the events, and they can
   * be removed all at once later on. The callback will always be called with object as context.
   *
   * @example
   * view.listenTo(model, 'change', view.render);
   *
   * @param {object}   obj      - Event context
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @returns {Events}
   */
  listenTo(obj, name, callback) {
    if (!obj) { return this; }
    const id = obj._listenId || (obj._listenId = _.uniqueId('l'));
    const listeningTo = this._listeningTo || (this._listeningTo = {});
    let listening = listeningTo[id];

    // This object is not listening to any other events on `obj` yet.
    // Setup the necessary references to track the listening callbacks.
    if (!listening) {
      const thisId = this._listenId || (this._listenId = _.uniqueId('l'));
      listening = listeningTo[id] = { obj, objId: id, id: thisId, listeningTo, count: 0 };
    }

    // Bind callbacks on obj, and keep track of them on listening.
    f_INTERNAL_ON(obj, name, callback, this, listening);
    return this;
  }

  /**
   * Just like `listenTo`, but causes the bound callback to fire only once before being removed.
   *
   * @param {object}   obj      - Event context
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @returns {Events}
   */
  listenToOnce(obj, name, callback) {
    // Map the event into a `{event: once}` object.
    const events = f_EVENTS_API(f_ONCE_MAP, {}, name, callback, _.bind(this.stopListening, this, obj));
    return this.listenTo(obj, events, void 0);
  }

  /**
   * Remove a previously-bound callback function from an object. If no context is specified, all of the versions of
   * the callback with different contexts will be removed. If no callback is specified, all callbacks for the event
   * will be removed. If no event is specified, callbacks for all events will be removed.
   *
   * Note that calling model.off(), for example, will indeed remove all events on the model — including events that
   * Backbone uses for internal bookkeeping.
   *
   * @example
   * // Removes just the `onChange` callback.
   * object.off("change", onChange);
   *
   * // Removes all "change" callbacks.
   * object.off("change");
   *
   * // Removes the `onChange` callback for all events.
   * object.off(null, onChange);
   *
   * // Removes all callbacks for `context` for all events.
   * object.off(null, null, context);
   *
   * // Removes all callbacks on `object`.
   * object.off();
   *
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @param {object}   context  - Event context
   * @returns {Events}
   */
  off(name, callback, context) {
    if(!this._events) { return this; }
    this._events = f_EVENTS_API(f_OFF_API, this._events, name, callback, { context, listeners: this._listeners });
    return this;
  }

  /**
   * Bind a callback function to an object. The callback will be invoked whenever the event is fired. If you have a
   * large number of different events on a page, the convention is to use colons to namespace them: "poll:start", or
   * "change:selection".
   *
   * To supply a context value for this when the callback is invoked, pass the optional last argument:
   * model.on('change', this.render, this) or model.on({change: this.render}, this).
   *
   * @example
   * The event string may also be a space-delimited list of several events...
   * book.on("change:title change:author", ...);
   *
   * @example
   * Callbacks bound to the special "all" event will be triggered when any event occurs, and are passed the name of
   * the event as the first argument. For example, to proxy all events from one object to another:
   * proxy.on("all", function(eventName) {
   *    object.trigger(eventName);
   * });
   *
   * @example
   * All Backbone event methods also support an event map syntax, as an alternative to positional arguments:
   * book.on({
   *    "change:author": authorPane.update,
   *    "change:title change:subtitle": titleView.update,
   *    "destroy": bookView.remove
   * });
   *
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @param {object}   context  - Event context
   * @returns {*}
   */
  on(name, callback, context) {
    return f_INTERNAL_ON(this, name, callback, context, void 0);
  }

  /**
   * Just like `on`, but causes the bound callback to fire only once before being removed. Handy for saying "the next
   * time that X happens, do this". When multiple events are passed in using the space separated syntax, the event
   * will fire once for every event you passed in, not once for a combination of all events
   *
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @param {object}   context  - Event context
   * @returns {*}
   */
  once(name, callback, context) {
    // Map the event into a `{event: once}` object.
    const events = f_EVENTS_API(f_ONCE_MAP, {}, name, callback, _.bind(this.off, this));
    return this.on(events, void 0, context);
  }

  /**
   * Tell an object to stop listening to events. Either call stopListening with no arguments to have the object remove
   * all of its registered callbacks ... or be more precise by telling it to remove just the events it's listening to
   * on a specific object, or a specific event, or just a specific callback.
   *
   * @example
   * view.stopListening();
   *
   * view.stopListening(model);
   *
   * @param {object}   obj      - Event context
   * @param {string}   name     - Event name(s)
   * @param {function} callback - Event callback function
   * @returns {Events}
   */
  stopListening(obj, name, callback) {
    const listeningTo = this._listeningTo;
    if (!listeningTo) { return this; }

    const ids = obj ? [obj._listenId] : _.keys(listeningTo);

    for (let i = 0; i < ids.length; i++) {
      const listening = listeningTo[ids[i]];

      // If listening doesn't exist, this object is not currently listening to obj. Break out early.
      if (!listening) { break; }

      listening.obj.off(name, callback, this);
    }
    if (_.isEmpty(listeningTo)) { this._listeningTo = void 0; }

    return this;
  }

  /**
   * Trigger callbacks for the given event, or space-delimited list of events. Subsequent arguments to trigger will be
   * passed along to the event callbacks.
   *
   * @param {string}   name  - Event name(s)
   * @returns {Events}
   */
  trigger(name) {
    if (!this._events) { return this; }

    const length = Math.max(0, arguments.length - 1);
    const args = new Array(length);

    for (let i = 0; i < length; i++) { args[i] = arguments[i + 1]; }

    f_EVENTS_API(f_TRIGGER_API, this._events, name, void 0, args);

    return this;
  }

  /**
   * Delegates to `off`.
   *
   * @returns {*}
   */
  unbind() {
    return this.off(...arguments);
  }
}

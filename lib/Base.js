import _ from 'underscore';
import Events from './Events';

import { triggerMethod, getOption, mergeOptions } from './utils';

export default class Base extends Events {

  /** */
  constructor(options) {
    super();

    this.cidPrefix = 'lgc';
    this._isDestroyed = false;

    this._setOptions(options);
    this.cid = _.uniqueId(this.cidPrefix);
    this.initialize.apply(this, arguments);
  }

  _setOptions(...args) {
    this.options = _.extend({}, _.result(this, 'options'), ...args);
  }

  getOption() {
    return getOption(arguments);
  }

  mergeOptions() {
    return mergeOptions(arguments);
  }

  isDestroyed() {
    return this._isDestroyed;
  }

  initialize() {}

  destroy(...args) {
    if (this._isDestroyed) { return this; }

    this.triggerMethod('before:destroy', this, ...args);

    this._isDestroyed = true;
    this.triggerMethod('destroy', this, ...args);
    this.stopListening();

    return this;
  }

  triggerMethod() {
    return triggerMethod();
  }

}

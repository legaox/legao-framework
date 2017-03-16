import _ from 'underscore';

const r_SPLITTER = /(^|:)(\w)/gi;

const f_GET_EVENT_NAME = (match, prefix, eventName) => {
  return eventName.toUpperCase();
};

const f_GET_ON_METHOD_NAME = _.memoize(function(event) {
  return 'on' + event.replace(r_SPLITTER, f_GET_EVENT_NAME);
});

export const triggerMethod = (event, ...args) => {
  const methodName = f_GET_ON_METHOD_NAME(event);
  const method = getOption.call(this, methodName);
  let result;

  if (_.isFunction(method)) { result = method.apply(this, args); }
  this.trigger.apply(this, arguments);

  return result;
};

export const triggerMethodOn = (context, ...args) => {
  if (_.isFunction(context.triggerMethod)) {
    return context.triggerMethod.apply(context, args);
  }

  return triggerMethod.apply(context, args);
};

export const getOption = (optionName) => {
  if (!optionName) { return; }
  if (this.options && (this.options[optionName] !== undefined)) {
    return this.options[optionName];
  } else {
    return this[optionName];
  }
};

export const mergeOptions = (options, keys) => {
  if (!options) { return; }
  _.each(keys, (key) => {
    const option = options[key];
    if (option !== undefined) { this[key] = option; }
  });
};

export const proxy = (method) => {
  return function(context, ...args) {
    return method.apply(context, args);
  };
};

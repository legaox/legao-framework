import _ from 'underscore';

const f_ADD_HASHCHANGE_LISTENER = (el, listener) => {
  if (el.addEventListener) {
    el.addEventListener('hashchange', listener, false);
  } else if (el.attachEvent) {
    el.attachEvent('hashchange', listener);
  }
};

const f_REMOVE_HASHCHANGE_LISTENER = (el, listener) => {
  if (el.removeEventListener) {
    el.removeEventListener('hashchange', listener, false);
  } else if (el.detachEvent) {
    el.detachEvent('hashchange', listener);
  }
};

const r_PATH_REPLACER = '([^\/\\?]+)';
const r_PATH_NAME_MATCHER = /:([\w\d]+)/g;
const r_PATH_EVERY_MATCHER = /\/\*(?!\*)/;
const r_PATH_EVERY_REPLACER = '\/([^\/\\?]+)';
const r_PATH_EVERY_GLOBAL_MATCHER = /\*{2}/;
const r_PATH_EVERY_GLOBAL_REPLACER = '(.*?)\\??';
const r_LEADING_BACKSLASHES_MATCH = /\/*$/;

class Request {
  constructor(href) {
    this.href = href;
    this.params = {};
    this.query = {};
    this.splat = {};
    this.hasNext = false;
  }

  get(key, defaultValue) {
    return (this.params && this.params[key] !== undefined) ?
      this.params[key] : (this.query && this.query[key] !== undefined) ?
      this.query[key] : (defaultValue !== undefined) ?
      defaultValue : undefined;
  }
}

export default class Router {

  constructor(options) {
    this._options = _.extend({
      ignorecase: true
    }, options || {});
    this._routes = [];
    this._befores = [];
    this._errors = {
      '_'(err, url, httpCode) {
        console.warn('Router.js : ' + httpCode);
      },
      '_404'(err, url) {
        console.warn('404! Unmatched route for url ' + url);
      },
      '_500'(err, url) {
        console.error('500! Internal error route for url ' + url);
      }
    };
    this._paused = false;
    this._hasChangeHandler = this._onHashChange.bind(this);
    f_ADD_HASHCHANGE_LISTENER(window, this._hasChangeHandler);
  }

  _onHashChange(e) {
    if (!this._paused) {
      this._route(this._extractFragment(window.location.href));
    }
    return true;
  }

  _extractFragment(url) {
    let hashIndex = url.indexOf('#');
    return hashIndex >= 0 ? url.substring(hashIndex) : '#/';
  }

  _throwsRouteError(httpCode, err, url) {
    if (this._errors['_' + httpCode] instanceof Function) {
      this._errors['_' + httpCode](err, url, httpCode);
    } else {
      this._errors._(err, url, httpCode);
    }
    return false;
  }

  _buildRequestObject(fragmentUrl, params, splat, hasNext) {
    if (!fragmentUrl) {
      throw new Error('Unable to compile request object');
    }
    const request = new Request(fragmentUrl);
    if (params) {
      request.params = params;
    }
    const completeFragment = fragmentUrl.split('?');
    if (completeFragment.length === 2) {
      let queryKeyValue = null;
      const queryString = completeFragment[1].split('&');
      request.query = {};
      for (let i = 0, qLen = queryString.length; i < qLen; i++) {
        queryKeyValue = queryString[i].split('=');
        request.query[decodeURI(queryKeyValue[0])] = decodeURI(queryKeyValue[1].replace(/\+/g, '%20'));
      }
      request.query;
    }
    if (splat && splat.length > 0) {
      request.splats = splat;
    }
    if (hasNext === true) {
      request.hasNext = true;
    }
    return request;
  }

  _followRoute(fragmentUrl, url, matchedIndexes) {
    const index = matchedIndexes.splice(0, 1);
    const route = this._routes[index];
    const match = url.match(route.path);
    let request;
    let params = {};
    let splat = [];
    let i;
    let len;
    if (!route) {
      return this._throwsRouteError(500, new Error('Internal error'), fragmentUrl);
    }
    for (i = 0, len = route.paramNames.length; i < len; i++) {
      params[route.paramNames[i]] = match[i + 1];
    }
    i = i + 1;
    if (match && i < match.length) {
      for (let j = i; j < match.length; j++) {
        splat.push(match[j]);
      }
    }
    const hasNext = (matchedIndexes.length !== 0);
    const next = (
      function(uO, u, mI, hnext) {
        return function(hasnext, err, errorCode) {
          if (!hasnext && !err) {
            return this._throwsRouteError(500, 'Cannot call "next" without an error if request.hasNext is false', fragmentUrl);
          }
          if (err) {
            return this._throwsRouteError(errorCode || 500, err, fragmentUrl);
          }
          this._followRoute(uO, u, mI);
        }.bind(this, hnext);
      }.bind(this)(fragmentUrl, url, matchedIndexes, hasNext)
    );
    request = this._buildRequestObject(fragmentUrl, params, splat, hasNext);
    route.routeAction(request, next);
  }

  _routeBefores(befores, before, fragmentUrl, url, matchedIndexes) {
    let next;
    if (befores.length > 0) {
      let nextBefore = befores.splice(0, 1);
      nextBefore = nextBefore[0];
      next = function(err, errorCode) {
        if (err) {
          return this._throwsRouteError(errorCode || 500, err, fragmentUrl);
        }
        this._routeBefores(befores, nextBefore, fragmentUrl, url, matchedIndexes);
      }.bind(this);
    } else {
      next = function(err, errorCode) {
        if (err) {
          return this._throwsRouteError(errorCode || 500, err, fragmentUrl);
        }
        this._followRoute(fragmentUrl, url, matchedIndexes);
      }.bind(this);
    }
    before(this._buildRequestObject(fragmentUrl, null, null, true), next);
  }

  _route(fragmentUrl) {
    let route = '';
    let befores = this._befores.slice();
    let matchedIndexes = [];
    let urlToTest;
    let url = fragmentUrl;
    if (url.length === 0) {
      return true;
    }
    url = url.replace(r_LEADING_BACKSLASHES_MATCH, '');
    urlToTest = (url.split('?'))[0].replace(r_LEADING_BACKSLASHES_MATCH, '');
    for (let p in this._routes) {
      if (this._routes.hasOwnProperty(p)) {
        route = this._routes[p];
        if (route.path.test(urlToTest)) {
          matchedIndexes.push(p);
        }
      }
    }

    if (matchedIndexes.length > 0) {
      if (befores.length > 0) {
        let before = befores.splice(0, 1);
        before = before[0];
        this._routeBefores(befores, before, fragmentUrl, url, matchedIndexes);
      } else {
        this._followRoute(fragmentUrl, url, matchedIndexes);
      }
    } else {
      return this._throwsRouteError(404, null, fragmentUrl);
    }
  }

  pause() {
    this._paused = true;
    return this;
  }

  play(triggerNow) {
    triggerNow = 'undefined' === typeof triggerNow ? false : triggerNow;
    this._paused = false;
    if (triggerNow) {
      this._route(this._extractFragment(window.location.href));
    }
    return this;
  }

  setLocation(url) {
    window.history.pushState(null,'',url);
    return this;
  }

  redirect(url) {
    this.setLocation(url);
    if (!this._paused) {
      this._route(this._extractFragment(url));
    }
    return this;
  }

  addRoute(path, callback) {
    let match;
    const modifiers = (this._options.ignorecase ? 'i' : '');
    let paramNames = [];
    if ('string' === typeof path) {
      /*Remove leading backslash from the end of the string*/
      path = path.replace(r_LEADING_BACKSLASHES_MATCH,'');
      /*Param Names are all the one defined as :param in the path*/
      while ((match = r_PATH_NAME_MATCHER.exec(path)) !== null) {
        paramNames.push(match[1]);
      }
      path = new RegExp(path
          .replace(r_PATH_NAME_MATCHER, r_PATH_REPLACER)
          .replace(r_PATH_EVERY_MATCHER, r_PATH_EVERY_REPLACER)
          .replace(r_PATH_EVERY_GLOBAL_MATCHER, r_PATH_EVERY_GLOBAL_REPLACER) + '(?:\\?.+)?$', modifiers);
    }
    this._routes.push({
      'path': path,
      'paramNames': paramNames,
      'routeAction': callback
    });
    return this;
  }

  before(callback) {
    this._befores.push(callback);
    return this;
  }

  errors(httpCode, callback) {
    if (isNaN(httpCode)) {
      throw new Error('Invalid code for routes error handling');
    }
    if (!(callback instanceof Function)) {
      throw new Error('Invalid callback for routes error handling');
    }
    httpCode = '_' + httpCode;
    this._errors[httpCode] = callback;
    return this;
  }

  run(startUrl) {
    if (!startUrl) {
      startUrl = this._extractFragment(window.location.href);
    }
    startUrl = startUrl.indexOf('#') === 0 ? startUrl : '#' + startUrl;
    this.redirect(startUrl);
    return this;
  }

  destroy() {
    f_REMOVE_HASHCHANGE_LISTENER(window, this._hasChangeHandler);
    return this;
  }

}

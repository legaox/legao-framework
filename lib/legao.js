import Base from './Base';
import Events from './Events';
import Router from './Router';

export default {
  Events: Events,
  Router: Router
}



const tt = new Base({ a: 'a' });

tt.on('xxxxx', () => {
  console.log('xxxxxxxxxxxxxx');
});

tt.trigger('xxxxx');

console.log('xx');

const router = new Router();
router.addRoute('#/users', function(req, next) {
  debugger
});
router.addRoute('#/user/:id', (req, next) => {
  debugger
});
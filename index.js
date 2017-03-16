import Base from './lib/Base';

const tt = new Base({ a: 'a' });

tt.on('xxxxx', () => {
  console.log('xxxxxxxxxxxxxx');
});

tt.trigger('xxxxx');

console.log('xx');

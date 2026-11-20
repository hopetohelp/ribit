import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const [accounts, chat] = await Promise.all(
  ['accounts-worker.mjs', 'chat-worker.mjs'].map(file => readFile(new URL(file, import.meta.url), 'utf8'))
);
// The Worker build places both files in a single module so their helpers are shared.
const MemberStore = new Function(chat + '\n' + accounts + '\nreturn MemberStore;')();

function createStore() {
  const db = new DatabaseSync(':memory:');
  const store = new MemberStore({
    sql: {
      exec(source, ...args) {
        const statement = db.prepare(source);
        if (statement.columns().length) {
          const rows = statement.all(...args);
          return { toArray: () => rows, one: () => rows[0] };
        }
        return { rowsWritten: statement.run(...args).changes };
      }
    },
    transactionSync(operation) {
      db.exec('BEGIN');
      try {
        const result = operation();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  });
  db.prepare('INSERT INTO member VALUES (1, ?, ?, ?, ?)').run('test', 'test@example.test', 'salt', '');
  return store;
}

const example = { title: 'תוכנית חיסכון', updatedAt: 1000, planCount: 1, calculation: '{"plans":[{}]}' };

test('only opening a cloud record adds it to the account history', async () => {
  const first = createStore();
  const second = createStore();
  const token = await first.newSession();
  const otherToken = await second.newSession();
  const { value: id } = await first.records(token, 'save', example);
  await first.records(token, 'load', { id });
  assert.deepEqual((await first.records(token, 'recent')).value, []);
  assert.equal((await second.records(otherToken, 'open', { id })).status, 404);
  assert.equal((await first.records(otherToken, 'recent')).status, 401);
  assert.equal((await first.records(token, 'open', { id })).status, 200);
  await first.records(token, 'rename', { id, title: 'שם חדש' });
  assert.deepEqual((await first.records(token, 'recent')).value.map(row => ({ ...row })), [{ id, title: 'שם חדש' }]);
  assert.deepEqual((await second.records(otherToken, 'recent')).value, []);
  await first.records(token, 'remove', { id });
  assert.deepEqual((await first.records(token, 'recent')).value, []);
});

test('repeating a cloud import request does not duplicate the batch', async () => {
  const store = createStore();
  const token = await store.newSession();
  const batch = { requestId: crypto.randomUUID(), entries: [example, example] };
  const results = await Promise.all([store.records(token, 'import', batch), store.records(token, 'import', batch)]);
  assert.deepEqual(results.map(outcome => outcome.status), [200, 200]);
  assert.equal((await store.records(token, 'list')).value.length, 2);
  await store.records(token, 'import', { ...batch, requestId: crypto.randomUUID() });
  assert.equal((await store.records(token, 'list')).value.length, 4);
});

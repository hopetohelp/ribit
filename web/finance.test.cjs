const assert = require('node:assert/strict');
const test = require('node:test');
const finance = require('./app/finance.js');

function plan(changes) {
  return Object.assign({
    initial: '10000', deposit: '0', annualRate: '10', months: 12,
    frequency: 'NONE', timing: 'END'
  }, changes);
}

function result(changes) {
  return finance.project(plan(changes)).points.at(-1);
}

function dollars(value) {
  return new finance.Money(value).toFixed(2);
}

test('compounds the same monthly, yearly and lump-sum scenarios as Android 1.0', () => {
  assert.equal(dollars(result({ annualRate: '5', months: 24 }).balance), '11025.00');
  assert.equal(dollars(result({ initial: '20000', deposit: '300', annualRate: '7', frequency: 'MONTHLY', months: 120 }).balance), '90658.55');
  assert.equal(dollars(result({ deposit: '1000', annualRate: '5', frequency: 'YEARLY', months: 18 }).contributed), '11000.00');
  assert.equal(dollars(result({ deposit: '1000', annualRate: '5', frequency: 'YEARLY', months: 18, timing: 'START' }).contributed), '12000.00');
});

test('applies effective annual management fees and charges end deposits next month', () => {
  assert.equal(dollars(result({ annualRate: '0', balanceFee: '1' }).balance), '9900.00');
  const start = result({ initial: '0', deposit: '1000', frequency: 'MONTHLY', timing: 'START', months: 1, annualRate: '0', balanceFee: '12' });
  const end = result({ initial: '0', deposit: '1000', frequency: 'MONTHLY', months: 1, annualRate: '0', balanceFee: '12' });
  assert.ok(new finance.Money(start.balance).lt(end.balance));
  assert.equal(dollars(end.balanceFees), '0.00');
});

test('charges deposit fees and uses the chosen cost basis', () => {
  const fields = { initial: '1000', depositFee: '2', taxType: 'NOMINAL', taxRate: '25' };
  const netBasis = result(fields);
  const grossBasis = result({ ...fields, includeDepositFeeInBasis: true });
  assert.equal(dollars(netBasis.depositFees), '20.00');
  assert.equal(dollars(netBasis.tax), '24.50');
  assert.equal(dollars(grossBasis.tax), '19.50');
});

test('distinguishes nominal tax and indexed tax from purchasing power', () => {
  const options = { inflation: '3', taxRate: '25' };
  const nominal = result({ ...options, taxType: 'NOMINAL' });
  const real = result({ ...options, taxType: 'REAL' });
  assert.equal(dollars(nominal.tax), '250.00');
  assert.equal(dollars(real.tax), '175.00');
  assert.equal(dollars(nominal.realNet), '10436.89');
  assert.equal(dollars(real.realNet), '10509.71');
});

test('does not index a deposit made at the realization date', () => {
  const base = { inflation: '3', taxRate: '25', taxType: 'REAL' };
  const withDeposit = result({ ...base, deposit: '1000', frequency: 'YEARLY' });
  assert.equal(dollars(withDeposit.tax), dollars(result(base).tax));
});

test('reports cumulative principal in today’s money using the deposit date', () => {
  const fields = { inflation: '10', deposit: '1100', frequency: 'YEARLY', annualRate: '0' };
  const start = result({ ...fields, timing: 'START' });
  const end = result(fields);
  assert.equal(dollars(start.contributed), '11100.00');
  assert.equal(dollars(end.contributed), '11100.00');
  assert.equal(dollars(start.realContributed), '11100.00');
  assert.equal(dollars(end.realContributed), '11000.00');
});

test('floors real cost basis during deflation and does not tax losses', () => {
  const deflation = result({ inflation: '-3', taxType: 'REAL', taxRate: '25' });
  assert.equal(dollars(deflation.tax), '250.00');
  assert.equal(dollars(result({ annualRate: '-5', taxType: 'REAL', taxRate: '25' }).tax), '0.00');
});

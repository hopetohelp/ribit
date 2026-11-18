(function (scope, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vendor/decimal.js'));
  } else {
    scope.RibitFinance = factory(scope.Decimal);
  }
}(this, function (Decimal) {
  'use strict';

  var Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
  var one = new Money(1);
  var zero = new Money(0);
  var twelfth = one.div(12);
  var currencies = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
  var intervals = { NONE: 0, MONTHLY: 1, YEARLY: 12 };

  function decimal(value) {
    return new Money(value || 0);
  }

  function rate(value) {
    return decimal(value).div(100);
  }

  function monthlyFactor(annualFactor) {
    if (annualFactor.eq(one)) return one;
    return annualFactor.pow(twelfth);
  }

  function financialOptions(plan) {
    return {
      depositFee: plan.depositFee || '0',
      balanceFee: plan.balanceFee || '0',
      inflation: plan.inflation || '0',
      taxType: plan.taxType || 'NONE',
      taxRate: plan.taxRate || '0',
      includeDepositFeeInBasis: !!plan.includeDepositFeeInBasis
    };
  }

  function project(plan) {
    var options = financialOptions(plan);
    var growth = monthlyFactor(one.plus(rate(plan.annualRate)));
    var retention = monthlyFactor(one.minus(rate(options.balanceFee)));
    var priceGrowth = monthlyFactor(one.plus(rate(options.inflation)));
    var taxIndex = priceGrowth.lt(one) ? one : priceGrowth;
    var depositRate = rate(options.depositFee);
    var taxRate = rate(options.taxRate);
    var interval = intervals[plan.frequency];
    var recurring = decimal(plan.deposit);
    var balance = zero;
    var contribution = zero;
    var depositFees = zero;
    var balanceFees = zero;
    var basis = zero;
    var indexedBasis = zero;
    var priceIndex = one;
    var points = [];

    function addDeposit(amount) {
      var fee = amount.times(depositRate);
      var invested = amount.minus(fee);
      var taxCost = options.includeDepositFeeInBasis ? amount : invested;
      contribution = contribution.plus(amount);
      depositFees = depositFees.plus(fee);
      balance = balance.plus(invested);
      basis = basis.plus(taxCost);
      indexedBasis = indexedBasis.plus(taxCost);
    }

    function point(month) {
      var taxBasis = options.taxType === 'REAL' ? indexedBasis : basis;
      var taxable = balance.minus(taxBasis);
      var tax = options.taxType === 'NONE' || taxable.lte(0) ? zero : taxable.times(taxRate);
      var net = balance.minus(tax);
      return {
        month: month,
        contributed: contribution.toString(),
        balance: balance.toString(),
        depositFees: depositFees.toString(),
        balanceFees: balanceFees.toString(),
        tax: tax.toString(),
        net: net.toString(),
        realNet: net.div(priceIndex).toString()
      };
    }

    addDeposit(decimal(plan.initial));
    points.push(point(0));
    for (var month = 1; month <= plan.months; month++) {
      if (interval && plan.timing === 'START' && (month - 1) % interval === 0) {
        addDeposit(recurring);
      }
      balance = balance.times(growth);
      if (!retention.eq(one)) {
        var afterFee = balance.times(retention);
        balanceFees = balanceFees.plus(balance.minus(afterFee));
        balance = afterFee;
      }
      indexedBasis = indexedBasis.times(taxIndex);
      priceIndex = priceIndex.times(priceGrowth);
      if (interval && plan.timing === 'END' && month % interval === 0) {
        addDeposit(recurring);
      }
      points.push(point(month));
    }
    return { points: points };
  }

  function calculate(currency, plans) {
    if (!Object.prototype.hasOwnProperty.call(currencies, currency) || plans.length < 1 || plans.length > 2) {
      throw new Error('Invalid calculation');
    }
    return { currency: currency, plans: plans, projections: plans.map(project), modelVersion: 2 };
  }

  function value(point, display) {
    if (display === 'realNet') return point.realNet || point.net || point.balance;
    return point.net || point.balance;
  }

  function amount(number, currency, compact) {
    var input = decimal(number);
    var numberText = compact && input.abs().gte('1000000000') ? input.abs().toExponential(2) : input.abs().toFixed(2);
    var parts = numberText.split('.');
    if (!/[eE]/.test(numberText)) {
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      numberText = parts.join('.');
    }
    return (input.lt(0) && !input.toDecimalPlaces(2).eq(0) ? '−' : '') +
      currencies[currency] + ' ' + numberText;
  }

  return {
    Money: Money,
    currencies: currencies,
    financialOptions: financialOptions,
    project: project,
    calculate: calculate,
    value: value,
    amount: amount
  };
}));

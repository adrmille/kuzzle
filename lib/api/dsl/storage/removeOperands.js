var containsOne = require('../util/containsOne');

/**
 * Exposes a sets of methods meant to store operands in
 * the DSL keyword-specific part of a field-operand  object
 *
 * All provided <f,o> pair object references must point to
 * the root of the structure. This allows cleaning up the
 * entire object when removing conditions
 *
 * @constructor
 */
function OperandsRemoval () {
  return this;
}

/**
 * Removes an empty filter from the structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 */
OperandsRemoval.prototype.everything = function everything (foPairs, index, collection) {
  destroy(foPairs, index, collection, 'everything');
};

/**
 * Removes a "equals" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.equals = function equals (foPairs, index, collection, subfilter, condition) {
  var
    fieldName = Object.keys(condition.value)[0],
    value = condition.value[fieldName],
    operand = foPairs[index][collection].equals;

  if (operand.fields[fieldName][value].length > 1) {
    operand.fields[fieldName][value].splice(operand.fields[fieldName][value].indexOf(subfilter), 1);
  }
  else if (Object.keys(operand.fields[fieldName]).length > 1) {
    delete operand.fields[fieldName][value];
  }
  else if (operand.keys.array.length > 1) {
    operand.keys.remove(fieldName);
    delete operand.fields[fieldName];
  }
  else {
    destroy(foPairs, index, collection, 'equals');
  }
};

/**
 * Removes a "not equals" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.notequals = function notequals (foPairs, index, collection, subfilter, condition) {
  var
    fieldName = Object.keys(condition.value)[0],
    value = condition.value[fieldName],
    operand = foPairs[index][collection].notequals,
    idx = operand.fields[fieldName].values.search({value});

  if (operand.fields[fieldName].values.array[idx].subfilters.length > 1) {
    operand.fields[fieldName].values.array[idx].subfilters.splice(
      operand.fields[fieldName].values.array[idx].subfilters.indexOf(subfilter)
      , 1);
  }
  else if (operand.fields[fieldName].values.array.length > 1) {
    operand.fields[fieldName].values.remove({value});
  }
  else if (operand.keys.array.length > 1) {
    operand.keys.remove(fieldName);
    delete operand.fields[fieldName];
  }
  else {
    destroy(foPairs, index, collection, 'notequals');
  }
};

/**
 * Removes a "exists" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 * @param {string} [keyword]
 */
OperandsRemoval.prototype.exists = function exists (foPairs, index, collection, subfilter, condition, keyword) {
  var
    operand,
    fieldName = condition.value.field;

  keyword = keyword || 'exists';
  operand = foPairs[index][collection][keyword];

  if (operand.fields[fieldName].length > 1) {
    operand.fields[fieldName].splice(operand.fields[fieldName].indexOf(subfilter), 1);
  }
  else if (operand.keys.array.length > 1) {
    delete operand.fields[fieldName];
    operand.keys.remove(fieldName);
  }
  else {
    destroy(foPairs, index, collection, keyword);
  }
};

/**
 * Removes a "not exists" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.notexists = function notexists (foPairs, index, collection, subfilter, condition) {
  this.exists(foPairs, index, collection, subfilter, condition, 'notexists');
};

/**
 * Removes a "range" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.range = function range (foPairs, index, collection, subfilter, condition) {
  var
    operand = foPairs[index][collection].range,
    field = Object.keys(condition.value)[0],
    info;

  if (operand.fields[field].count > 1) {
    info = operand.fields[field].subfilters[subfilter.id];
    operand.fields[field].tree.remove(info.low, info.high, info.subfilter);
    operand.fields[field].count--;
    delete operand.fields[field].subfilters[subfilter.id];
  }
  else if (operand.keys.array.length > 1) {
    delete operand.fields[field];
    operand.keys.remove(field);
  }
  else {
    destroy(foPairs, index, collection, 'range');
  }
};

/**
 * Removes a "not range" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.notrange = function notrange (foPairs, index, collection, subfilter, condition) {
  var
    operand = foPairs[index][collection].notrange,
    field = Object.keys(condition.value)[0],
    info;

  if (operand.fields[field].count > 1) {
    info = operand.fields[field].subfilters[subfilter.id];

    if (info.low !== -Infinity) {
      operand.fields[field].tree.remove(-Infinity, info.low, info.subfilter);
    }

    if (info.high !== Infinity) {
      operand.fields[field].tree.remove(info.high, Infinity, info.subfilter);
    }

    operand.fields[field].count--;
    delete operand.fields[field].subfilters[subfilter.id];
  }
  else if (operand.keys.array.length > 1) {
    delete operand.fields[field];
    operand.keys.remove(field);
  }
  else {
    destroy(foPairs, index, collection, 'notrange');
  }
};


/**
 * Removes a "regexp" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 * @param {string} [keyword]
 */
OperandsRemoval.prototype.regexp = function regexp (foPairs, index, collection, subfilter, condition, keyword) {
  var
    fieldName = Object.keys(condition.value)[0],
    stringValue = (new RegExp(condition.value[fieldName].value, condition.value[fieldName].flags)).toString(),
    operand,
    idx;

  keyword = keyword || 'regexp';

  operand = foPairs[index][collection][keyword];
  idx = operand.fields[fieldName].expressions.search({stringValue});

  if (operand.fields[fieldName].expressions.array[idx].subfilters.length > 1) {
    operand.fields[fieldName].expressions.array[idx].subfilters.splice(
      operand.fields[fieldName].expressions.array[idx].subfilters.indexOf(subfilter)
      , 1);
  }
  else if (operand.fields[fieldName].expressions.array.length > 1) {
    operand.fields[fieldName].expressions.remove({stringValue});
  }
  else if (operand.keys.array.length > 1) {
    operand.keys.remove(fieldName);
    delete operand.fields[fieldName];
  }
  else {
    destroy(foPairs, index, collection, keyword);
  }
};


/**
 * Removes a "not regexp" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.notregexp = function notregexp (foPairs, index, collection, subfilter, condition) {
  this.regexp(foPairs, index, collection, subfilter, condition, 'notregexp');
};

/**
 * Removes a "geospatial" value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.geospatial = function equals (foPairs, index, collection, subfilter, condition) {
  var
    operand = foPairs[index][collection].geospatial,
    geotype = Object.keys(condition.value)[0],
    fieldName = Object.keys(condition.value[geotype])[0];

  if (operand.fields[fieldName][condition.id].length > 1) {
    operand.fields[fieldName][condition.id].splice(operand.fields[fieldName][condition.id].indexOf(subfilter), 1);
  }
  else if (Object.keys(operand.fields[fieldName]).length > 1) {
    delete operand.fields[fieldName][condition.id];
    operand.custom.index.remove(condition.id);
  }
  else if (operand.keys.array.length > 1) {
    delete operand.fields[fieldName];
    operand.keys.remove(fieldName);
    operand.custom.index.remove(condition.id);
  }
  else {
    destroy(foPairs, index, collection, 'geospatial');
  }
};

/**
 * Removes a "not geospatial " value from the field-operand structure
 *
 * The condition
 * @param {object} foPairs
 * @param {string} index
 * @param {string} collection
 * @param {object} subfilter
 * @param {object} condition
 */
OperandsRemoval.prototype.notgeospatial = function notgeospatial (foPairs, index, collection, subfilter, condition) {
  var
    operand = foPairs[index][collection].notgeospatial,
    geotype = Object.keys(condition.value)[0],
    fieldName = Object.keys(condition.value[geotype])[0],
    idx = operand.fields[fieldName].ids.search({id: condition.id});

  if (idx > -1 && operand.fields[fieldName].ids.array[idx].subfilters.length > 1) {
    operand.fields[fieldName].ids.array[idx].subfilters.splice(
      operand.fields[fieldName].ids.array[idx].subfilters.indexOf(subfilter)
      , 1);
  }
  else if (operand.fields[fieldName].ids.array.length > 1) {
    operand.fields[fieldName].ids.remove({id: condition.id});
  }
  else if (operand.keys.array.length > 1) {
    operand.keys.remove(fieldName);
    delete operand.fields[fieldName];
  }
  else {
    destroy(foPairs, index, collection, 'notgeospatial');
  }
};

/**
 * Performs a cascading removal of a field-operand pair
 *
 * @param foPairs
 * @param index
 * @param collection
 * @param operand
 */
function destroy(foPairs, index, collection, operand) {
  if (containsOne(foPairs[index][collection])) {
    if (containsOne(foPairs[index])) {
      delete foPairs[index];
    }
    else {
      delete foPairs[index][collection];
    }
  }
  else {
    delete foPairs[index][collection][operand];
  }
}

module.exports = OperandsRemoval;

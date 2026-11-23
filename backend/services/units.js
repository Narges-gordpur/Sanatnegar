'use strict';

const { normalizePersianText, parseNumber } = require('../document-processing/normalizer');

const ATTR_SYNONYMS = [
  ['power', ['توان', 'توان نامی', 'توان موتور', 'توان مصرفی', 'قدرت', 'قدرت موتور', 'power', 'rated power', 'motor power', 'input power', 'output power']],
  ['voltage', ['ولتاژ', 'ولتاژ کاری', 'ولتاژ نامی', 'ولتاژ تغذیه', 'ولتاژ ورودی', 'voltage', 'rated voltage', 'supply voltage', 'input voltage']],
  ['current', ['جریان', 'جریان نامی', 'جریان مصرفی', 'شدت جریان', 'current', 'rated current', 'max current']],
  ['frequency', ['فرکانس', 'بسامد', 'فرکانس کاری', 'frequency', 'rated frequency']],
  ['operating_pressure', ['فشار', 'فشار کاری', 'فشار عملیاتی', 'فشار مجاز', 'pressure', 'working pressure', 'operating pressure', 'rated pressure']],
  ['max_pressure', ['حداکثر فشار', 'بیشینه فشار', 'ماکزیمم فشار', 'max pressure', 'maximum pressure']],
  ['flow_rate', ['دبی', 'دبی نامی', 'ظرفیت دبی', 'ظرفیت آبدهی', 'میزان جریان', 'ظرفیت', 'flow', 'flow rate', 'nominal flow', 'capacity']],
  ['head', ['هد', 'ارتفاع پمپاژ', 'هد پمپ', 'هد نامی', 'head', 'pump head', 'total head']],
  ['speed', ['دور موتور', 'سرعت چرخش', 'دور', 'سرعت', 'speed', 'rotational speed', 'motor speed', 'rpm']],
  ['weight', ['وزن', 'وزن خالص', 'جرم', 'وزن دستگاه', 'weight', 'net weight', 'mass']],
  ['temperature', ['دما', 'دمای کاری', 'دمای عملیاتی', 'دمای محیط', 'temperature', 'operating temperature', 'working temperature']],
  ['max_temperature', ['حداکثر دما', 'بیشینه دما', 'max temperature', 'maximum temperature']],
  ['min_temperature', ['حداقل دما', 'کمینه دما', 'min temperature', 'minimum temperature']],
  ['efficiency', ['راندمان', 'بازده', 'بهره وری', 'efficiency']],
  ['length', ['طول', 'length']],
  ['width', ['عرض', 'width']],
  ['height', ['ارتفاع', 'height']],
  ['diameter', ['قطر', 'diameter']],
  ['material', ['جنس', 'جنس بدنه', 'متریال', 'آلیاژ', 'material', 'body material']],
  ['standards', ['استاندارد', 'استانداردها', 'standard', 'standards']],
  ['certifications', ['گواهینامه', 'گواهی', 'گواهی ها', 'تاییدیه', 'certificate', 'certification', 'certifications']],
  ['ip_rating', ['درجه حفاظت', 'کد حفاظتی', 'ip', 'ip rating', 'protection class']],
  ['noise', ['سطح صدا', 'میزان صدا', 'نویز', 'صدا', 'noise', 'noise level', 'sound level']]
];

const UNIT_DEFS = {
  // Power (base W)
  'w': { dim: 'power', factor: 1, std: 'W' },
  'وات': { dim: 'power', factor: 1, std: 'W' },
  'kw': { dim: 'power', factor: 1000, std: 'kW' },
  'کیلووات': { dim: 'power', factor: 1000, std: 'kW' },
  'mw': { dim: 'power', factor: 1e6, std: 'MW' },
  'مگاوات': { dim: 'power', factor: 1e6, std: 'MW' },
  'hp': { dim: 'power', factor: 745.7, std: 'HP' },
  'اسب بخار': { dim: 'power', factor: 745.7, std: 'HP' },

  // Voltage (base V)
  'mv': { dim: 'voltage', factor: 0.001, std: 'mV' },
  'میلی ولت': { dim: 'voltage', factor: 0.001, std: 'mV' },
  'v': { dim: 'voltage', factor: 1, std: 'V' },
  'ولت': { dim: 'voltage', factor: 1, std: 'V' },
  'kv': { dim: 'voltage', factor: 1000, std: 'kV' },
  'کیلوولت': { dim: 'voltage', factor: 1000, std: 'kV' },

  // Current (base A)
  'ma': { dim: 'current', factor: 0.001, std: 'mA' },
  'میلی آمپر': { dim: 'current', factor: 0.001, std: 'mA' },
  'a': { dim: 'current', factor: 1, std: 'A' },
  'آمپر': { dim: 'current', factor: 1, std: 'A' },

  // Frequency (base Hz)
  'hz': { dim: 'frequency', factor: 1, std: 'Hz' },
  'هرتز': { dim: 'frequency', factor: 1, std: 'Hz' },
  'khz': { dim: 'frequency', factor: 1000, std: 'kHz' },
  'کیلوهرتز': { dim: 'frequency', factor: 1000, std: 'kHz' },
  'mhz': { dim: 'frequency', factor: 1e6, std: 'MHz' },
  'مگاهرتز': { dim: 'frequency', factor: 1e6, std: 'MHz' },

  // Pressure (base Pa)
  'pa': { dim: 'pressure', factor: 1, std: 'Pa' },
  'پاسکال': { dim: 'pressure', factor: 1, std: 'Pa' },
  'kpa': { dim: 'pressure', factor: 1000, std: 'kPa' },
  'کیلوپاسکال': { dim: 'pressure', factor: 1000, std: 'kPa' },
  'mpa': { dim: 'pressure', factor: 1e6, std: 'MPa' },
  'مگاپاسکال': { dim: 'pressure', factor: 1e6, std: 'MPa' },
  'gpa': { dim: 'pressure', factor: 1e9, std: 'GPa' },
  'bar': { dim: 'pressure', factor: 1e5, std: 'bar' },
  'بار': { dim: 'pressure', factor: 1e5, std: 'bar' },
  'mbar': { dim: 'pressure', factor: 100, std: 'mbar' },
  'میلی بار': { dim: 'pressure', factor: 100, std: 'mbar' },
  'psi': { dim: 'pressure', factor: 6894.76, std: 'psi' },

  // Mass (base g)
  'mg': { dim: 'mass', factor: 0.001, std: 'mg' },
  'میلی گرم': { dim: 'mass', factor: 0.001, std: 'mg' },
  'g': { dim: 'mass', factor: 1, std: 'g' },
  'گرم': { dim: 'mass', factor: 1, std: 'g' },
  'kg': { dim: 'mass', factor: 1000, std: 'kg' },
  'کیلوگرم': { dim: 'mass', factor: 1000, std: 'kg' },
  'ton': { dim: 'mass', factor: 1e6, std: 'ton' },
  't': { dim: 'mass', factor: 1e6, std: 'ton' },
  'تن': { dim: 'mass', factor: 1e6, std: 'ton' },
  'lb': { dim: 'mass', factor: 453.592, std: 'lb' },

  // Length (base m)
  'mm': { dim: 'length', factor: 0.001, std: 'mm' },
  'میلی متر': { dim: 'length', factor: 0.001, std: 'mm' },
  'cm': { dim: 'length', factor: 0.01, std: 'cm' },
  'سانتی متر': { dim: 'length', factor: 0.01, std: 'cm' },
  'm': { dim: 'length', factor: 1, std: 'm' },
  'متر': { dim: 'length', factor: 1, std: 'm' },
  'km': { dim: 'length', factor: 1000, std: 'km' },
  'inch': { dim: 'length', factor: 0.0254, std: 'inch' },
  'in': { dim: 'length', factor: 0.0254, std: 'inch' },

  // Volume (base L)
  'ml': { dim: 'volume', factor: 0.001, std: 'ml' },
  'میلی لیتر': { dim: 'volume', factor: 0.001, std: 'ml' },
  'l': { dim: 'volume', factor: 1, std: 'L' },
  'لیتر': { dim: 'volume', factor: 1, std: 'L' },
  'm3': { dim: 'volume', factor: 1000, std: 'm³' },
  'm³': { dim: 'volume', factor: 1000, std: 'm³' },
  'مترمکعب': { dim: 'volume', factor: 1000, std: 'm³' },
  'متر مکعب': { dim: 'volume', factor: 1000, std: 'm³' },

  // Flow rate (base m3/h)
  'm3/h': { dim: 'flow', factor: 1, std: 'm³/h' },
  'm³/h': { dim: 'flow', factor: 1, std: 'm³/h' },
  'مترمکعب بر ساعت': { dim: 'flow', factor: 1, std: 'm³/h' },
  'متر مکعب بر ساعت': { dim: 'flow', factor: 1, std: 'm³/h' },
  'مترمکعب در ساعت': { dim: 'flow', factor: 1, std: 'm³/h' },
  'متر مکعب در ساعت': { dim: 'flow', factor: 1, std: 'm³/h' },
  'l/h': { dim: 'flow', factor: 0.001, std: 'L/h' },
  'لیتر بر ساعت': { dim: 'flow', factor: 0.001, std: 'L/h' },
  'لیتر در ساعت': { dim: 'flow', factor: 0.001, std: 'L/h' },
  'l/min': { dim: 'flow', factor: 0.06, std: 'L/min' },
  'l/m': { dim: 'flow', factor: 0.06, std: 'L/min' },
  'لیتر بر دقیقه': { dim: 'flow', factor: 0.06, std: 'L/min' },
  'لیتر در دقیقه': { dim: 'flow', factor: 0.06, std: 'L/min' },
  'm3/min': { dim: 'flow', factor: 60, std: 'm³/min' },
  'm³/min': { dim: 'flow', factor: 60, std: 'm³/min' },
  'gpm': { dim: 'flow', factor: 0.227124, std: 'GPM' },

  // Speed (base rpm)
  'rpm': { dim: 'speed', factor: 1, std: 'rpm' },
  'دور بر دقیقه': { dim: 'speed', factor: 1, std: 'rpm' },
  'دور در دقیقه': { dim: 'speed', factor: 1, std: 'rpm' },
  'rps': { dim: 'speed', factor: 60, std: 'rps' },

  // Temperature (base Celsius)
  '°c': { dim: 'temperature', kind: 'C', std: '°C' },
  'c': { dim: 'temperature', kind: 'C', std: '°C' },
  'سانتیگراد': { dim: 'temperature', kind: 'C', std: '°C' },
  'درجه سانتیگراد': { dim: 'temperature', kind: 'C', std: '°C' },
  '°f': { dim: 'temperature', kind: 'F', std: '°F' },
  'f': { dim: 'temperature', kind: 'F', std: '°F' },
  'فارنهایت': { dim: 'temperature', kind: 'F', std: '°F' },
  'k': { dim: 'temperature', kind: 'K', std: 'K' },
  'کلوین': { dim: 'temperature', kind: 'K', std: 'K' },

  // Percent
  '%': { dim: 'percent', factor: 1, std: '%' },
  'درصد': { dim: 'percent', factor: 1, std: '%' },

  // Time (base s)
  'ms': { dim: 'time', factor: 0.001, std: 'ms' },
  's': { dim: 'time', factor: 1, std: 's' },
  'sec': { dim: 'time', factor: 1, std: 's' },
  'ثانیه': { dim: 'time', factor: 1, std: 's' },
  'min': { dim: 'time', factor: 60, std: 'min' },
  'دقیقه': { dim: 'time', factor: 60, std: 'min' },
  'h': { dim: 'time', factor: 3600, std: 'h' },
  'hr': { dim: 'time', factor: 3600, std: 'h' },
  'ساعت': { dim: 'time', factor: 3600, std: 'h' },

  // Force, Torque, Noise, Energy
  'n': { dim: 'force', factor: 1, std: 'N' },
  'نیوتن': { dim: 'force', factor: 1, std: 'N' },
  'kn': { dim: 'force', factor: 1000, std: 'kN' },
  'کیلونیوتن': { dim: 'force', factor: 1000, std: 'kN' },
  'nm': { dim: 'torque', factor: 1, std: 'Nm' },
  'n.m': { dim: 'torque', factor: 1, std: 'Nm' },
  'نیوتن متر': { dim: 'torque', factor: 1, std: 'Nm' },
  'db': { dim: 'noise', factor: 1, std: 'dB' },
  'دسی بل': { dim: 'noise', factor: 1, std: 'dB' },
  'wh': { dim: 'energy', factor: 1, std: 'Wh' },
  'kwh': { dim: 'energy', factor: 1000, std: 'kWh' },
  'کیلووات ساعت': { dim: 'energy', factor: 1000, std: 'kWh' }
};

function canonicalAttribute(rawName) {
  const norm = normalizePersianText(rawName)
    .toLowerCase()
    .replace(/[:\-_()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [key, variants] of ATTR_SYNONYMS) {
    if (variants.some(v => norm === normalizePersianText(v).toLowerCase())) {
      return { key, label: variants[0] };
    }
  }
  return { key: 'raw:' + norm, label: normalizePersianText(rawName) };
}

function getUnitInfo(rawUnit) {
  const key = normalizePersianText(rawUnit || '').toLowerCase();
  if (!key) return null;
  if (UNIT_DEFS[key]) return UNIT_DEFS[key];
  return { dim: 'custom:' + key, factor: 1, std: rawUnit.trim() };
}

function toBaseValue(num, uInfo) {
  if (num === null || !uInfo) return null;
  if (uInfo.dim === 'temperature') {
    if (uInfo.kind === 'C') return num;
    if (uInfo.kind === 'F') return (num - 32) * 5 / 9;
    if (uInfo.kind === 'K') return num - 273.15;
  }
  return num * uInfo.factor;
}

function normalizeFactMeasurement(rawValue, rawUnit) {
  const num = parseNumber(rawValue);
  const uInfo = getUnitInfo(rawUnit);
  const baseVal = num !== null && uInfo ? toBaseValue(num, uInfo) : num;
  return {
    normalizedValue: baseVal,
    standardUnit: uInfo ? uInfo.std : '',
    unitDimension: uInfo ? uInfo.dim : ''
  };
}

function compareFactValues(left, right) {
  const n1 = parseNumber(left.raw_value);
  const n2 = parseNumber(right.raw_value);
  const u1 = getUnitInfo(left.raw_unit);
  const u2 = getUnitInfo(right.raw_unit);

  if (n1 !== null && n2 !== null) {
    if (u1 && u2) {
      if (u1.dim !== u2.dim) {
        return { conflict: true, reason: `ابعاد فیزیکی ناسازگار (${u1.std} در برابر ${u2.std})` };
      }
      const b1 = toBaseValue(n1, u1);
      const b2 = toBaseValue(n2, u2);
      const scale = Math.max(1, Math.abs(b1), Math.abs(b2));
      const relDiff = Math.abs(b1 - b2) / scale;
      if (relDiff <= 0.005) {
        return {
          conflict: false,
          equivalent: true,
          reason: `معادل فیزیکی (${left.raw_value} ${u1.std} ≈ ${right.raw_value} ${u2.std})`
        };
      }
      return {
        conflict: true,
        reason: `مقدار متفاوت (${left.raw_value} ${u1.std} در برابر ${right.raw_value} ${u2.std})`
      };
    }
    if (Boolean(u1) !== Boolean(u2)) {
      return { conflict: true, reason: 'یک مورد دارای واحد و مورد دیگر بدون واحد است' };
    }
    if (Math.abs(n1 - n2) <= 1e-6) {
      return { conflict: false, equivalent: true };
    }
    return { conflict: true, reason: `مقدار عددی متفاوت (${n1} در برابر ${n2})` };
  }

  const s1 = normalizePersianText(left.raw_value).toLowerCase() + '|' + (u1 ? u1.std.toLowerCase() : '');
  const s2 = normalizePersianText(right.raw_value).toLowerCase() + '|' + (u2 ? u2.std.toLowerCase() : '');
  if (s1 === s2) return { conflict: false, equivalent: true };
  return { conflict: true, reason: 'مقدار یا بازه متنی متفاوت' };
}

module.exports = {
  ATTR_SYNONYMS,
  UNIT_DEFS,
  canonicalAttribute,
  getUnitInfo,
  toBaseValue,
  normalizeFactMeasurement,
  compareFactValues
};

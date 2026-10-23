/* @ds-bundle: {"format":3,"namespace":"DesignSystem_d38635","components":[{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Button","sourcePath":"components/button/Button.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"AvatarGroup","sourcePath":"components/data/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Message","sourcePath":"components/feedback/Message.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"DatePicker","sourcePath":"components/forms/DatePicker.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField.jsx"},{"name":"InputText","sourcePath":"components/forms/InputText.jsx"},{"name":"RadioButton","sourcePath":"components/forms/RadioButton.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"ToggleSwitch","sourcePath":"components/forms/ToggleSwitch.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Card","sourcePath":"components/panel/Card.jsx"},{"name":"Dialog","sourcePath":"components/panel/Dialog.jsx"}],"sourceHashes":{"components/brand/Logo.jsx":"f424bb571400","components/button/Button.jsx":"eabdc65c6120","components/data/Avatar.jsx":"fae5255e1739","components/data/Badge.jsx":"42f5d8b8536c","components/data/DataTable.jsx":"6d8d4b65783e","components/feedback/EmptyState.jsx":"d1cfa19901b3","components/feedback/Message.jsx":"b1164cf5be8f","components/feedback/Tooltip.jsx":"ebbaaa379098","components/forms/Checkbox.jsx":"3abb076704f1","components/forms/DatePicker.jsx":"400328be7817","components/forms/FormField.jsx":"6d83748fbfe2","components/forms/InputText.jsx":"c6e8594038ee","components/forms/RadioButton.jsx":"4e999b28fdf9","components/forms/Select.jsx":"9b8e168274e4","components/forms/Textarea.jsx":"63daeb222212","components/forms/ToggleSwitch.jsx":"807972cf9ba0","components/navigation/Breadcrumb.jsx":"c90f52110153","components/navigation/Tabs.jsx":"9044a3a66ba3","components/panel/Card.jsx":"2efd142ea92a","components/panel/Dialog.jsx":"bcce57910405","ui_kits/icpv-reputa/app.jsx":"8d1a09262bf4"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_d38635 = window.DesignSystem_d38635 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Logo.jsx
try { (() => {
/**
 * VPTWĐ brand mark — the waving Party + national flag (hammer-sickle + gold star).
 * Composed from the source SVG fragments. `assetBase` is the relative path to
 * the logo asset folder from the consuming HTML page (default "assets/logos").
 */
function Logo({
  height = 48,
  variant = "flag",
  assetBase = "assets/logos",
  showWordmark = false,
  wordmark = "VĂN PHÒNG TRUNG ƯƠNG ĐẢNG",
  className = "",
  style
}) {
  const base = assetBase.replace(/\/$/, "");

  // Favicon: red rounded square with gold hammer-sickle
  if (variant === "favicon") {
    const s = height;
    return /*#__PURE__*/React.createElement("span", {
      className: className,
      style: {
        display: "inline-flex",
        ...style
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        width: s,
        height: s,
        borderRadius: s * 0.21,
        background: "rgb(218,37,29)",
        overflow: "hidden",
        display: "inline-block"
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: `${base}/favicon-hammer-sickle.svg`,
      alt: "",
      style: {
        position: "absolute",
        left: "11.5%",
        top: "16%",
        width: "73.5%",
        height: "64%"
      }
    })));
  }

  // Flag (150.079 x 90.756). Star + hammer-sickle overlaid within the wave.
  const W = height * (150.079 / 90.756);
  const flag = /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: W,
      height,
      display: "inline-block",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `${base}/flag-red.svg`,
    alt: "",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%"
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: `${base}/flag-hs.svg`,
    alt: "",
    style: {
      position: "absolute",
      left: "13.24%",
      top: "29.92%",
      width: "25.15%",
      height: "34.74%"
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: `${base}/flag-star.svg`,
    alt: "",
    style: {
      position: "absolute",
      left: "55.51%",
      top: "29.92%",
      width: "26.49%",
      height: "36.21%"
    }
  }));
  if (!showWordmark) return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: style
  }, flag);
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: height * 0.32,
      ...style
    }
  }, flag, /*#__PURE__*/React.createElement("span", {
    style: {
      font: `700 ${Math.round(height * 0.42)}px var(--font-display)`,
      color: "var(--ds-primary)",
      letterSpacing: ".01em",
      lineHeight: 1.1
    }
  }, wordmark));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/button/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — VPTWĐ design system. PrimeNG-compatible API.
 * Default (no severity) renders the Party-red primary button.
 */
function Button({
  label,
  icon,
  iconPos = "left",
  severity,
  outlined = false,
  text = false,
  link = false,
  raised = false,
  rounded = false,
  size,
  loading = false,
  disabled = false,
  fluid = false,
  badge,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = ["p-button", severity && `p-button-${severity}`, outlined && "p-button-outlined", text && "p-button-text", link && "p-button-link", raised && "p-button-raised", rounded && "p-button-rounded", fluid && "p-button-fluid", size === "small" && "p-button-sm", size === "large" && "p-button-lg", (loading || disabled) && "p-disabled", !label && !children && (icon || loading) && "p-button-icon-only", className].filter(Boolean).join(" ");
  const content = label ?? children;
  const showIcon = loading ? "pi pi-spinner p-button-loading-icon" : icon;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled || loading
  }, rest), showIcon && iconPos === "left" && /*#__PURE__*/React.createElement("i", {
    className: `${showIcon} p-button-icon`
  }), content != null && /*#__PURE__*/React.createElement("span", {
    className: "p-button-label"
  }, content), showIcon && iconPos === "right" && /*#__PURE__*/React.createElement("i", {
    className: `${showIcon} p-button-icon`
  }), badge != null && /*#__PURE__*/React.createElement("span", {
    className: "p-badge p-badge-contrast"
  }, badge));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/button/Button.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Avatar — image or initials/icon. */
function Avatar({
  label,
  icon,
  image,
  size,
  shape = "circle",
  className = "",
  style,
  ...rest
}) {
  const cls = ["p-avatar", size === "small" && "p-avatar-sm", size === "large" && "p-avatar-lg", shape === "square" && "p-avatar-square", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: style
  }, rest), image ? /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: label || ""
  }) : icon ? /*#__PURE__*/React.createElement("i", {
    className: icon
  }) : label);
}

/** Overlapping avatar group. */
function AvatarGroup({
  children,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `p-avatar-group ${className}`
  }, children);
}
Object.assign(__ds_scope, { Avatar, AvatarGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge. Two modes:
 *  • Count / dot indicator (default) — pass `value` (number/text) or `dot`.
 *  • Status label — pass `label` for a soft tonal text pill (Figma "Badge"
 *    page: Chờ xử lý / Đang xử lý / …). Optional `statusDot` shows a leading dot.
 */
function Badge({
  value,
  label,
  severity,
  size,
  dot = false,
  statusDot = false,
  icon,
  rounded = false,
  className = "",
  children,
  ...rest
}) {
  const text = label ?? children;
  if (text != null && !dot) {
    const cls = ["p-badge", "p-badge-status", severity && `p-badge-${severity}`, rounded && "p-badge-status-rounded", className].filter(Boolean).join(" ");
    return /*#__PURE__*/React.createElement("span", _extends({
      className: cls
    }, rest), icon && /*#__PURE__*/React.createElement("i", {
      className: `${icon} p-badge-status-icon`
    }), statusDot && !icon && /*#__PURE__*/React.createElement("span", {
      className: "p-badge-status-dot"
    }), text);
  }
  const cls = ["p-badge", severity && `p-badge-${severity}`, size === "large" && "p-badge-lg", dot && "p-badge-dot", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), !dot && value);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * DataTable — PrimeNG-style table.
 * columns: [{ field, header, align?, sortable?, body?(row) }]
 * Lightweight client-side sort for prototype use.
 */
function DataTable({
  value = [],
  columns = [],
  striped = false,
  selectable = false,
  footer,
  className = "",
  ...rest
}) {
  const [sort, setSort] = React.useState({
    field: null,
    dir: 1
  });
  const [sel, setSel] = React.useState(null);
  const rows = React.useMemo(() => {
    if (!sort.field) return value;
    return [...value].sort((a, b) => {
      const x = a[sort.field],
        y = b[sort.field];
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [value, sort]);
  function toggleSort(c) {
    if (!c.sortable) return;
    setSort(s => s.field === c.field ? {
      field: c.field,
      dir: -s.dir
    } : {
      field: c.field,
      dir: 1
    });
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `p-datatable ${striped ? "p-datatable-striped" : ""} ${className}`
  }, rest), /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.field,
    className: [c.sortable && "p-sortable", c.align === "right" && "p-col-num"].filter(Boolean).join(" "),
    onClick: () => toggleSort(c)
  }, c.header, c.sortable && /*#__PURE__*/React.createElement("i", {
    className: `p-sort-icon pi ${sort.field === c.field ? sort.dir === 1 ? "pi-sort-amount-up-alt" : "pi-sort-amount-down" : "pi-sort-alt"}`
  }))))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: row.id ?? i,
    className: selectable && sel === (row.id ?? i) ? "p-selected" : "",
    onClick: selectable ? () => setSel(row.id ?? i) : undefined
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.field,
    className: c.align === "right" ? "p-col-num" : ""
  }, c.body ? c.body(row) : row[c.field])))))), footer && /*#__PURE__*/React.createElement("div", {
    className: "p-datatable-footer"
  }, footer));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EmptyState — DS-native "no data / nothing here yet" pattern.
 * Not a default PrimeNG component; built from the DS token + `.p-*` vocabulary
 * so it reads as part of the system. Use inside empty tables, lists, panels,
 * search results, and first-run screens.
 */
function EmptyState({
  icon = "pi pi-inbox",
  title,
  description,
  size = "md",
  brand = false,
  inline = false,
  actions,
  className = "",
  children,
  ...rest
}) {
  const cls = ["p-emptystate", size !== "md" && `p-emptystate-${size}`, brand && "p-emptystate-brand", inline && "p-emptystate-inline", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "p-emptystate-icon"
  }, /*#__PURE__*/React.createElement("i", {
    className: icon
  })), title && /*#__PURE__*/React.createElement("p", {
    className: "p-emptystate-title"
  }, title), description && /*#__PURE__*/React.createElement("p", {
    className: "p-emptystate-description"
  }, description), children, actions && actions.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "p-emptystate-actions"
  }, actions));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Message.jsx
try { (() => {
const ICONS = {
  info: "pi pi-info-circle",
  success: "pi pi-check-circle",
  warn: "pi pi-exclamation-triangle",
  error: "pi pi-exclamation-circle",
  secondary: "pi pi-check-circle"
};

/** Inline alert / banner. Pass icon={false} to render without a leading icon. */
function Message({
  severity = "info",
  summary,
  detail,
  icon,
  closable = false,
  outlined = false,
  onClose,
  actions,
  className = "",
  children
}) {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  // icon === false (or null) hides the leading icon entirely.
  const showIcon = icon !== false && icon !== null;
  const cls = ["p-message", `p-message-${severity}`, outlined && "p-message-outlined", !showIcon && "p-message-noicon", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: cls,
    role: "alert"
  }, showIcon && /*#__PURE__*/React.createElement("span", {
    className: "p-message-icon"
  }, /*#__PURE__*/React.createElement("i", {
    className: typeof icon === "string" ? icon : ICONS[severity]
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-message-body"
  }, summary && /*#__PURE__*/React.createElement("span", {
    className: "p-message-summary"
  }, summary), (detail || children) && /*#__PURE__*/React.createElement("span", {
    className: "p-message-detail"
  }, detail || children), actions && /*#__PURE__*/React.createElement("div", {
    className: "p-message-actions"
  }, actions.map((a, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "p-message-action",
    onClick: a.onClick
  }, a.label)))), closable && /*#__PURE__*/React.createElement("button", {
    className: "p-message-close",
    "aria-label": "\u0110\xF3ng",
    onClick: () => {
      setOpen(false);
      onClose && onClose();
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-times"
  })));
}
Object.assign(__ds_scope, { Message });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Message.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
/**
 * Hover tooltip. Wrap a trigger and pass `content` (and optional `title` for a
 * rich title+body bubble). `severity` sets the tone, `placement` the side.
 * Pass `open` to force it visible (e.g. specimens / always-on hints).
 */
function Tooltip({
  content,
  title,
  severity,
  placement = "top",
  open = false,
  children,
  className = ""
}) {
  const cls = ["p-tooltip", `p-tooltip-${placement}`, severity && `p-tooltip-${severity}`, title && "p-tooltip-rich", open && "p-tooltip-static", className].filter(Boolean).join(" ");
  const bubble = /*#__PURE__*/React.createElement("span", {
    className: cls,
    role: "tooltip"
  }, title ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "p-tooltip-title"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "p-tooltip-text"
  }, content)) : content);
  if (open && !children) return bubble;
  return /*#__PURE__*/React.createElement("span", {
    className: `p-tooltip-host ${open ? "p-tooltip-host-open" : ""}`.trim()
  }, children, bubble);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox — tonal-red (Figma): light fill, red border, red check/minus.
 * Optional `label`/`description` render a labelled choice row.
 * `indeterminate` shows the red minus glyph; `invalid` switches to the danger ramp.
 */
function Checkbox({
  checked,
  defaultChecked,
  indeterminate,
  onChange,
  disabled,
  invalid,
  label,
  description,
  id,
  className = "",
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate, checked]);
  const box = /*#__PURE__*/React.createElement("span", {
    className: `p-checkbox${invalid ? " p-invalid" : ""}`
  }, /*#__PURE__*/React.createElement("input", _extends({
    ref: ref,
    type: "checkbox",
    id: id,
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "p-checkbox-box"
  }, /*#__PURE__*/React.createElement("i", {
    className: `pi ${indeterminate ? "pi-minus" : "pi-check"} p-checkbox-icon`
  })));
  if (!label && !description) return /*#__PURE__*/React.createElement("span", {
    className: className
  }, box);
  return /*#__PURE__*/React.createElement("label", {
    className: `p-choice ${className}`,
    htmlFor: id
  }, box, /*#__PURE__*/React.createElement("span", {
    className: "p-choice-body"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "p-choice-title"
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "p-choice-desc"
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/DatePicker.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
function pad(n) {
  return String(n).padStart(2, "0");
}
function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmt(d) {
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

/** Build a 6-week (42-cell) Monday-first grid for the given year/month. */
function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const start = new Date(year, month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: d,
      other: d.getMonth() !== month
    });
  }
  return cells;
}

/**
 * DatePicker — calendar with optional time + footer. PrimeNG-style markup.
 * `inline` renders the panel directly; otherwise an input toggles it.
 */
function DatePicker({
  value,
  inline = false,
  showTime = false,
  showFooter = inline,
  selectionMode = "single",
  placeholder = "dd/mm/yyyy",
  disabled = false,
  className = "",
  ...rest
}) {
  const init = value instanceof Date ? value : new Date(2024, 5, 15);
  const [view, setView] = React.useState(new Date(init.getFullYear(), init.getMonth(), 1));
  const [selected, setSelected] = React.useState(selectionMode === "single" ? init : null);
  const [range, setRange] = React.useState(selectionMode === "range" ? [new Date(2024, 5, 12), new Date(2024, 5, 18)] : [null, null]);
  const [open, setOpen] = React.useState(inline);
  const today = new Date();
  const cells = buildGrid(view.getFullYear(), view.getMonth());
  const shift = n => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  function pick(d) {
    if (selectionMode === "range") {
      const [a, b] = range;
      if (!a || a && b) setRange([d, null]);else setRange(d < a ? [d, a] : [a, d]);
    } else {
      setSelected(d);
    }
  }
  function dayClass(d) {
    const cls = ["p-datepicker-day"];
    const c = cells.find(x => sameDay(x.date, d));
    if (c && c.other) cls.push("p-datepicker-day-other");
    if (sameDay(d, today)) cls.push("p-datepicker-day-today");
    if (selectionMode === "range") {
      const [a, b] = range;
      if (a && sameDay(d, a)) cls.push("p-datepicker-day-range-start");else if (b && sameDay(d, b)) cls.push("p-datepicker-day-range-end");else if (a && b && d > a && d < b) cls.push("p-datepicker-day-in-range");
    } else if (sameDay(d, selected)) cls.push("p-datepicker-day-selected");
    return cls.join(" ");
  }
  const panel = /*#__PURE__*/React.createElement("div", {
    className: `p-datepicker-panel ${inline ? "p-datepicker-panel-inline" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-datepicker-header"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "p-datepicker-nav-btn",
    onClick: () => shift(-1),
    "aria-label": "Th\xE1ng tr\u01B0\u1EDBc"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-chevron-left"
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-datepicker-title"
  }, /*#__PURE__*/React.createElement("span", null, "Th\xE1ng ", view.getMonth() + 1), /*#__PURE__*/React.createElement("span", {
    className: "p-datepicker-year"
  }, view.getFullYear())), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "p-datepicker-nav-btn",
    onClick: () => shift(1),
    "aria-label": "Th\xE1ng sau"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-chevron-right"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-datepicker-grid"
  }, WEEKDAYS.map(w => /*#__PURE__*/React.createElement("div", {
    key: w,
    className: "p-datepicker-weekday"
  }, w)), cells.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: dayClass(c.date),
    onClick: () => pick(c.date)
  }, c.date.getDate()))), showTime && /*#__PURE__*/React.createElement("div", {
    className: "p-datepicker-time"
  }, /*#__PURE__*/React.createElement("span", {
    className: "p-datepicker-time-field"
  }, /*#__PURE__*/React.createElement("input", {
    defaultValue: "08:00",
    "aria-label": selectionMode === "range" ? "Giờ bắt đầu" : "Giờ"
  }), /*#__PURE__*/React.createElement("i", {
    className: "pi pi-clock"
  })), selectionMode === "range" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "p-datepicker-time-sep"
  }, "\u2013"), /*#__PURE__*/React.createElement("span", {
    className: "p-datepicker-time-field"
  }, /*#__PURE__*/React.createElement("input", {
    defaultValue: "09:00",
    "aria-label": "Gi\u1EDD k\u1EBFt th\xFAc"
  }), /*#__PURE__*/React.createElement("i", {
    className: "pi pi-clock"
  })))), showFooter && /*#__PURE__*/React.createElement("div", {
    className: "p-datepicker-footer"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "p-button p-button-outlined p-button-secondary p-button-sm"
  }, "Hu\u1EF7"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "p-button p-button-sm"
  }, "X\xE1c nh\u1EADn")));
  if (inline) return /*#__PURE__*/React.createElement("div", _extends({
    className: `p-datepicker-inline ${className}`
  }, rest), panel);
  const display = selectionMode === "range" ? range[0] ? `${fmt(range[0])} – ${fmt(range[1])}` : "" : fmt(selected);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `p-datepicker ${className}`
  }, rest), /*#__PURE__*/React.createElement("input", {
    className: "p-datepicker-input",
    placeholder: placeholder,
    value: display,
    disabled: disabled,
    readOnly: true,
    onFocus: () => setOpen(true),
    onClick: () => setOpen(true)
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "p-datepicker-trigger",
    disabled: disabled,
    onClick: () => setOpen(o => !o),
    "aria-label": "M\u1EDF l\u1ECBch"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-calendar"
  })), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 0,
      zIndex: 60
    }
  }, panel));
}
Object.assign(__ds_scope, { DatePicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/DatePicker.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormField.jsx
try { (() => {
/** Field wrapper: label (with optional required mark), control slot, helper/error text. */
function FormField({
  label,
  required = false,
  help,
  error,
  htmlFor,
  className = "",
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `p-field ${className}`
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "p-field-label",
    htmlFor: htmlFor
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "p-required"
  }, "*")), children, (error || help) && /*#__PURE__*/React.createElement("span", {
    className: `p-field-help ${error ? "p-error" : ""}`
  }, error || help));
}
Object.assign(__ds_scope, { FormField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormField.jsx", error: String((e && e.message) || e) }); }

// components/forms/InputText.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** PrimeNG-style text input. Use `invalid` for error state, `iconLeft`/`iconRight` for adornments. */
function InputText({
  size,
  invalid = false,
  iconLeft,
  iconRight,
  onIconRightClick,
  className = "",
  ...rest
}) {
  const input = /*#__PURE__*/React.createElement("input", _extends({
    className: ["p-inputtext", size === "small" && "p-inputtext-sm", size === "large" && "p-inputtext-lg", invalid && "p-invalid", !iconLeft && !iconRight && className].filter(Boolean).join(" ")
  }, rest));
  if (!iconLeft && !iconRight) return input;
  return /*#__PURE__*/React.createElement("div", {
    className: `p-iconfield ${iconLeft ? "p-iconfield-left" : "p-iconfield-right"} ${className}`
  }, iconLeft && /*#__PURE__*/React.createElement("i", {
    className: `${iconLeft} p-input-icon`
  }), input, iconRight && /*#__PURE__*/React.createElement("i", {
    className: `${iconRight} p-input-icon ${onIconRightClick ? "p-clickable" : ""}`,
    onClick: onIconRightClick
  }));
}
Object.assign(__ds_scope, { InputText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/InputText.jsx", error: String((e && e.message) || e) }); }

// components/forms/RadioButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio button. Optional `label`/`description` render a labelled choice row. */
function RadioButton({
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  disabled,
  label,
  description,
  id,
  className = "",
  ...rest
}) {
  const box = /*#__PURE__*/React.createElement("span", {
    className: "p-radiobutton"
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    id: id,
    name: name,
    value: value,
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "p-radiobutton-box"
  }));
  if (!label && !description) return /*#__PURE__*/React.createElement("span", {
    className: className
  }, box);
  return /*#__PURE__*/React.createElement("label", {
    className: `p-choice ${className}`,
    htmlFor: id
  }, box, /*#__PURE__*/React.createElement("span", {
    className: "p-choice-body"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "p-choice-title"
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "p-choice-desc"
  }, description)));
}
Object.assign(__ds_scope, { RadioButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RadioButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select (PrimeNG Select / Dropdown). Options: array of { label, value } or strings.
 * Lightweight: manages its own open/close + selection for prototype use.
 */
function Select({
  options = [],
  value,
  onChange,
  placeholder = "Chọn...",
  disabled,
  className = "",
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const ref = React.useRef(null);
  const cur = value !== undefined ? value : val;
  React.useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const norm = options.map(o => typeof o === "string" ? {
    label: o,
    value: o
  } : o);
  const selected = norm.find(o => o.value === cur);
  function pick(o) {
    setVal(o.value);
    onChange && onChange(o.value);
    setOpen(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: "relative"
    },
    className: className
  }, /*#__PURE__*/React.createElement("div", _extends({
    className: `p-select ${open ? "p-open p-focus" : ""}`,
    role: "combobox",
    "aria-expanded": open,
    tabIndex: disabled ? -1 : 0,
    onClick: () => !disabled && setOpen(v => !v)
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: `p-select-label ${selected ? "" : "p-placeholder"}`
  }, selected ? selected.label : placeholder), /*#__PURE__*/React.createElement("i", {
    className: "pi pi-chevron-down p-select-dropdown-icon"
  })), open && /*#__PURE__*/React.createElement("div", {
    className: "p-select-overlay"
  }, norm.map(o => /*#__PURE__*/React.createElement("div", {
    key: String(o.value),
    className: `p-select-option ${o.value === cur ? "p-selected" : ""}`,
    onClick: () => pick(o)
  }, o.label))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line text input. */
function Textarea({
  invalid = false,
  rows = 4,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows,
    className: ["p-inputtext", invalid && "p-invalid", className].filter(Boolean).join(" ")
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/forms/ToggleSwitch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Toggle switch (PrimeNG ToggleSwitch / InputSwitch). */
function ToggleSwitch({
  checked,
  defaultChecked,
  onChange,
  disabled,
  id,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `p-toggleswitch ${className}`
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    id: id,
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "p-toggleswitch-slider"
  }));
}
Object.assign(__ds_scope, { ToggleSwitch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ToggleSwitch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
/** Breadcrumb trail. items: [{ label, icon?, href? }]. Last item is current. */
function Breadcrumb({
  items = [],
  home = true,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: `p-breadcrumb ${className}`,
    "aria-label": "breadcrumb"
  }, home && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("a", {
    className: "p-breadcrumb-item p-breadcrumb-home",
    href: "#"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-home"
  })), /*#__PURE__*/React.createElement("span", {
    className: "p-breadcrumb-sep"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-angle-right"
  }))), items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, /*#__PURE__*/React.createElement("a", {
      className: `p-breadcrumb-item ${last ? "p-current" : ""}`,
      href: it.href || "#",
      "aria-current": last ? "page" : undefined
    }, it.icon && /*#__PURE__*/React.createElement("i", {
      className: it.icon
    }), it.label), !last && /*#__PURE__*/React.createElement("span", {
      className: "p-breadcrumb-sep"
    }, /*#__PURE__*/React.createElement("i", {
      className: "pi pi-angle-right"
    })));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs. tabs: [{ value, label, icon?, badge?, disabled?, content? }].
 * variant: "underline" (default) | "pill" | "segmented" | "soft".
 * fluid: stretch tabs to fill the row (full-width / justified).
 * Supports disabled tabs and a keyboard focus ring (see navigation.css).
 */
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  variant = "underline",
  fluid = false,
  className = ""
}) {
  const firstEnabled = (tabs.find(t => !t.disabled) || tabs[0] || {}).value;
  const [active, setActive] = React.useState(defaultValue ?? value ?? firstEnabled);
  const cur = value !== undefined ? value : active;
  function select(v) {
    setActive(v);
    onChange && onChange(v);
  }
  const activeTab = tabs.find(t => t.value === cur);
  const listVariant = {
    pill: "p-tablist-pill",
    segmented: "p-tablist-segmented",
    soft: "p-tablist-soft"
  }[variant] || "";
  const listCls = ["p-tablist", listVariant, fluid && "p-tablist-fluid"].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: `p-tabs ${className}`
  }, /*#__PURE__*/React.createElement("div", {
    className: listCls,
    role: "tablist"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.value,
    role: "tab",
    "aria-selected": t.value === cur,
    disabled: t.disabled,
    "aria-disabled": t.disabled || undefined,
    className: `p-tab ${t.value === cur ? "p-active" : ""}`,
    onClick: () => !t.disabled && select(t.value)
  }, t.icon && /*#__PURE__*/React.createElement("i", {
    className: t.icon
  }), t.label, t.badge != null && /*#__PURE__*/React.createElement("span", {
    className: "p-badge"
  }, t.badge)))), activeTab && activeTab.content !== undefined && /*#__PURE__*/React.createElement("div", {
    className: "p-tabpanel",
    role: "tabpanel"
  }, activeTab.content));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/panel/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Content card with optional header image, title/subtitle, body and footer. */
function Card({
  title,
  subtitle,
  image,
  footer,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `p-card ${className}`
  }, rest), image && /*#__PURE__*/React.createElement("div", {
    className: "p-card-header"
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-card-body"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "p-card-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "p-card-subtitle"
  }, subtitle), children && /*#__PURE__*/React.createElement("div", {
    className: "p-card-content"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "p-card-footer"
  }, footer)));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panel/Card.jsx", error: String((e && e.message) || e) }); }

// components/panel/Dialog.jsx
try { (() => {
/** Modal dialog. Controlled via `visible` + `onHide`.
 *  `footerLayout`: "right" (default, content-sized at right) · "split"
 *  (equal-width 50/50) · "stacked" (full-width, primary on top). */
function Dialog({
  visible,
  onHide,
  header,
  footer,
  footerLayout = "right",
  width,
  className = "",
  children
}) {
  if (!visible) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "p-dialog-mask",
    onMouseDown: e => {
      if (e.target === e.currentTarget) onHide && onHide();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `p-dialog ${className}`,
    style: width ? {
      maxWidth: width
    } : undefined,
    role: "dialog",
    "aria-modal": "true"
  }, (header || onHide) && /*#__PURE__*/React.createElement("div", {
    className: "p-dialog-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "p-dialog-title"
  }, header), onHide && /*#__PURE__*/React.createElement("button", {
    className: "p-dialog-close",
    "aria-label": "\u0110\xF3ng",
    onClick: onHide
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-times"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-dialog-content"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: `p-dialog-footer ${footerLayout !== "right" ? `p-dialog-footer-${footerLayout}` : ""}`.trim()
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panel/Dialog.jsx", error: String((e && e.message) || e) }); }

// ui_kits/icpv-reputa/app.jsx
try { (() => {
/* iCPV Reputa — UI kit screens. Composes the VPTWĐ design-system components.
   Exposes window.ICPV = { App }. Loaded after the DS bundle in index.html. */
const DS = window.DesignSystem_d38635;
const {
  Button,
  InputText,
  FormField,
  Checkbox,
  Card,
  Badge,
  Avatar,
  DataTable,
  Message,
  Breadcrumb,
  Tabs,
  Logo
} = DS;
const ASSET = "../../assets/logos";

/* ── Top header ───────────────────────────────────────────────────── */
function AppHeader({
  active = "tong-quan",
  onNav
}) {
  const nav = [["tong-quan", "Tổng quan"], ["chu-de", "Chủ đề"], ["tin-bai", "Tin bài"], ["thong-ke", "Thống kê"], ["canh-bao", "Cảnh báo"], ["bao-cao", "Báo cáo"], ["noi-bat", "Tin bài nổi bật"]];
  return /*#__PURE__*/React.createElement("header", {
    className: "icpv-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-brand"
  }, /*#__PURE__*/React.createElement(Logo, {
    height: 42,
    assetBase: ASSET
  }), /*#__PURE__*/React.createElement("div", {
    className: "icpv-brand-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-brand-title"
  }, "iCPV Reputa"), /*#__PURE__*/React.createElement("div", {
    className: "icpv-brand-sub"
  }, "H\u1EC7 th\u1ED1ng thu th\u1EADp, t\u1ED5ng h\u1EE3p th\xF4ng tin tr\xEAn Internet"))), /*#__PURE__*/React.createElement("nav", {
    className: "icpv-nav"
  }, nav.map(([k, label]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: `icpv-nav-item ${active === k ? "active" : ""}`,
    onClick: () => onNav && onNav(k)
  }, label))), /*#__PURE__*/React.createElement("div", {
    className: "icpv-header-right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icpv-icon-btn",
    "aria-label": "Th\xF4ng b\xE1o"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-bell"
  }), /*#__PURE__*/React.createElement("span", {
    className: "icpv-bell-badge"
  }, "3")), /*#__PURE__*/React.createElement("button", {
    className: "icpv-icon-btn",
    "aria-label": "L\xE0m m\u1EDBi"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-refresh"
  })), /*#__PURE__*/React.createElement("button", {
    className: "icpv-user"
  }, /*#__PURE__*/React.createElement(Avatar, {
    icon: "pi pi-user",
    size: "small"
  }), /*#__PURE__*/React.createElement("span", null, "Admin"), /*#__PURE__*/React.createElement("i", {
    className: "pi pi-angle-down"
  }))));
}

/* ── Login ────────────────────────────────────────────────────────── */
function LoginScreen({
  onLogin
}) {
  const [show, setShow] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "icpv-login"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-wave"
  }), /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-logo"
  }, /*#__PURE__*/React.createElement(Logo, {
    height: 64,
    assetBase: ASSET
  }), /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-org"
  }, "V\u0102N PH\xD2NG TRUNG \u01AF\u01A0NG \u0110\u1EA2NG")), /*#__PURE__*/React.createElement(Card, {
    className: "icpv-login-card"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "icpv-login-title"
  }, "\u0110\u0103ng nh\u1EADp"), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onLogin();
    },
    className: "icpv-login-form"
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i/ S\u1ED1 th\u1EBB \u0111\u1EA3ng"
  }, /*#__PURE__*/React.createElement(InputText, {
    placeholder: "Nh\u1EADp s\u1ED1 \u0111i\u1EC7n tho\u1EA1i ho\u1EB7c s\u1ED1 th\u1EBB \u0111\u1EA3ng vi\xEAn",
    defaultValue: "0987-654-321"
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "M\u1EADt kh\u1EA9u"
  }, /*#__PURE__*/React.createElement(InputText, {
    type: show ? "text" : "password",
    defaultValue: "123456789",
    iconRight: show ? "pi pi-eye-slash" : "pi pi-eye",
    onIconRightClick: () => setShow(v => !v)
  })), /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-forgot"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Qu\xEAn m\u1EADt kh\u1EA9u")), /*#__PURE__*/React.createElement(Button, {
    label: "\u0110\u0103ng nh\u1EADp",
    type: "submit",
    fluid: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-register"
  }, "\u0110\u1ED3ng ch\xED ch\u01B0a c\xF3 t\xE0i kho\u1EA3n? ", /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "\u0110\u0103ng k\xFD ngay")), /*#__PURE__*/React.createElement("div", {
    className: "icpv-login-hotline"
  }, /*#__PURE__*/React.createElement("i", {
    className: "pi pi-phone"
  }), " Hot line h\u1ED7 tr\u1EE3: ", /*#__PURE__*/React.createElement("b", null, "19001080")))));
}

/* ── KPI stat card ────────────────────────────────────────────────── */
function Stat({
  label,
  value,
  delta,
  up,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "icpv-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-stat-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "icpv-stat-value"
  }, value), /*#__PURE__*/React.createElement("div", {
    className: `icpv-stat-delta ${up ? "up" : "down"}`,
    style: tone ? {
      color: tone
    } : undefined
  }, /*#__PURE__*/React.createElement("i", {
    className: `pi ${up ? "pi-arrow-up-right" : "pi-arrow-down-right"}`
  }), " ", delta, /*#__PURE__*/React.createElement("span", {
    className: "icpv-stat-vs"
  }, "so v\u1EDBi tu\u1EA7n tr\u01B0\u1EDBc")));
}

/* ── Donut (sentiment) — clean CSS conic ──────────────────────────── */
function SentimentDonut() {
  const data = [["Tích cực", 62, "var(--ds-success)"], ["Trung lập", 26, "var(--neutral-400)"], ["Tiêu cực", 12, "var(--ds-danger)"]];
  let acc = 0;
  const stops = data.map(([, v, c]) => {
    const s = `${c} ${acc}% ${acc + v}%`;
    acc += v;
    return s;
  }).join(", ");
  return /*#__PURE__*/React.createElement("div", {
    className: "icpv-donut-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-donut",
    style: {
      background: `conic-gradient(${stops})`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-donut-hole"
  }, /*#__PURE__*/React.createElement("b", null, "8.420"), /*#__PURE__*/React.createElement("span", null, "tin b\xE0i"))), /*#__PURE__*/React.createElement("ul", {
    className: "icpv-legend"
  }, data.map(([l, v, c]) => /*#__PURE__*/React.createElement("li", {
    key: l
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: c
    }
  }), l, /*#__PURE__*/React.createElement("b", null, v, "%")))));
}

/* ── Source bar chart ─────────────────────────────────────────────── */
function SourceBars() {
  const rows = [["Báo điện tử", 92], ["Mạng xã hội", 74], ["Diễn đàn", 48], ["Blog", 31], ["YouTube", 19]];
  return /*#__PURE__*/React.createElement("div", {
    className: "icpv-bars"
  }, rows.map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    className: "icpv-bar-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "icpv-bar-label"
  }, l), /*#__PURE__*/React.createElement("div", {
    className: "icpv-bar-track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-bar-fill",
    style: {
      width: `${v}%`
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "icpv-bar-val"
  }, v, "%"))));
}

/* ── Overview dashboard ───────────────────────────────────────────── */
function Overview() {
  const senti = {
    "Tích cực": "success",
    "Trung lập": "secondary",
    "Tiêu cực": "danger"
  };
  const articles = [{
    id: 1,
    title: "Hội nghị Trung ương 11 khóa XIII khai mạc",
    src: "Báo Nhân Dân",
    st: "Tích cực",
    time: "10 phút trước"
  }, {
    id: 2,
    title: "Đẩy mạnh chuyển đổi số trong công tác đảng",
    src: "VnExpress",
    st: "Tích cực",
    time: "32 phút trước"
  }, {
    id: 3,
    title: "Phản ánh về thủ tục hành chính tại địa phương",
    src: "Facebook",
    st: "Tiêu cực",
    time: "1 giờ trước"
  }, {
    id: 4,
    title: "Tổng kết phong trào thi đua yêu nước 2026",
    src: "TTXVN",
    st: "Trung lập",
    time: "2 giờ trước"
  }];
  return /*#__PURE__*/React.createElement("main", {
    className: "icpv-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icpv-page-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Breadcrumb, {
    items: [{
      label: "Tổng quan"
    }]
  }), /*#__PURE__*/React.createElement("h1", {
    className: "icpv-page-title"
  }, "T\u1ED5ng quan")), /*#__PURE__*/React.createElement("div", {
    className: "icpv-page-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    label: "7 ng\xE0y qua",
    icon: "pi pi-calendar",
    severity: "secondary",
    outlined: true,
    size: "small"
  }), /*#__PURE__*/React.createElement(Button, {
    label: "Xu\u1EA5t b\xE1o c\xE1o",
    icon: "pi pi-download",
    size: "small"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "icpv-stats"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "T\u1ED5ng tin b\xE0i",
    value: "8.420",
    delta: "12,4%",
    up: true
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "T\xEDch c\u1EF1c",
    value: "5.220",
    delta: "8,1%",
    up: true,
    tone: "var(--ds-success)"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Trung l\u1EADp",
    value: "2.190",
    delta: "2,3%",
    up: true
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Ti\xEAu c\u1EF1c",
    value: "1.010",
    delta: "4,7%",
    up: false,
    tone: "var(--ds-danger)"
  })), /*#__PURE__*/React.createElement(Message, {
    severity: "warn",
    outlined: true,
    summary: "C\u1EA3nh b\xE1o s\u1EAFc th\xE1i",
    detail: "Ph\xE1t hi\u1EC7n 3 c\u1EE5m tin ti\xEAu c\u1EF1c c\xF3 d\u1EA5u hi\u1EC7u lan truy\u1EC1n nhanh trong 1 gi\u1EDD qua.",
    actions: [{
      label: "Xem cảnh báo"
    }],
    closable: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "icpv-grid"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Ph\xE2n b\u1ED1 s\u1EAFc th\xE1i",
    className: "icpv-card-chart"
  }, /*#__PURE__*/React.createElement(SentimentDonut, null)), /*#__PURE__*/React.createElement(Card, {
    title: "Ngu\u1ED3n thu th\u1EADp",
    className: "icpv-card-chart"
  }, /*#__PURE__*/React.createElement(SourceBars, null))), /*#__PURE__*/React.createElement(Card, {
    title: "Tin b\xE0i m\u1EDBi nh\u1EA5t",
    className: "icpv-card-table"
  }, /*#__PURE__*/React.createElement(DataTable, {
    value: articles,
    selectable: true,
    columns: [{
      field: "title",
      header: "Tiêu đề",
      sortable: true,
      body: r => /*#__PURE__*/React.createElement("span", {
        className: "icpv-art-title"
      }, r.title)
    }, {
      field: "src",
      header: "Nguồn",
      sortable: true
    }, {
      field: "st",
      header: "Sắc thái",
      body: r => /*#__PURE__*/React.createElement(Badge, {
        label: r.st,
        severity: senti[r.st]
      })
    }, {
      field: "time",
      header: "Thời gian",
      align: "right"
    }]
  })));
}
function App() {
  const [authed, setAuthed] = React.useState(false);
  const [nav, setNav] = React.useState("tong-quan");
  if (!authed) return /*#__PURE__*/React.createElement(LoginScreen, {
    onLogin: () => setAuthed(true)
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "icpv-app"
  }, /*#__PURE__*/React.createElement(AppHeader, {
    active: nav,
    onNav: setNav
  }), /*#__PURE__*/React.createElement(Overview, null));
}
window.ICPV = {
  App,
  AppHeader,
  LoginScreen,
  Overview
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/icpv-reputa/app.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarGroup = __ds_scope.AvatarGroup;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Message = __ds_scope.Message;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.DatePicker = __ds_scope.DatePicker;

__ds_ns.FormField = __ds_scope.FormField;

__ds_ns.InputText = __ds_scope.InputText;

__ds_ns.RadioButton = __ds_scope.RadioButton;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.ToggleSwitch = __ds_scope.ToggleSwitch;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Dialog = __ds_scope.Dialog;

})();

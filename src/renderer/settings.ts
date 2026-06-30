/**
 * settings.ts — Renderer logic for the Settings window.
 *
 * Renders all plugin-declared configuration properties grouped by plugin,
 * and lets the user edit values visually. Changes are saved immediately
 * via IPC to the ConfigurationManager in the main process.
 *
 * Each property type renders an appropriate control:
 *   - boolean → checkbox
 *   - string (with enum) → dropdown
 *   - string → text input
 *   - number → number input (with optional min/max)
 *   - array → textarea (JSON)
 *   - object → textarea (JSON)
 */

// Inline types to avoid `import` which requires module system in <script> context.

interface ConfigurationPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: unknown;
  description?: string;
  enum?: unknown[];
  enumDescriptions?: string[];
  items?: { type: string };
  minimum?: number;
  maximum?: number;
  order?: number;
}

interface ConfigurationSection {
  pluginName: string;
  title: string;
  properties: Array<{
    key: string;
    schema: ConfigurationPropertySchema;
    value: unknown;
    isDefault: boolean;
  }>;
}

const SETTINGS_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function settingsEscapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => SETTINGS_ESCAPE_MAP[ch]);
}

const configApi = window.electronAPI.configuration;
const container = document.getElementById('settingsContainer')!;
const searchInput = document.getElementById('searchInput') as HTMLInputElement;

// ─── Load and render ────────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  const sections: ConfigurationSection[] = await configApi.getAll();
  container.innerHTML = '';

  if (sections.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无可配置的插件设置项</div>';
    return;
  }

  for (const section of sections) {
    // Sort properties by order hint
    const sortedProps = [...section.properties].sort(
      (a, b) => (a.schema.order ?? 999) - (b.schema.order ?? 999),
    );

    const sectionEl = document.createElement('div');
    sectionEl.className = 'settings-section';
    sectionEl.dataset.pluginName = section.pluginName;

    const headerEl = document.createElement('h2');
    headerEl.className = 'section-title';
    headerEl.textContent = section.title;
    sectionEl.appendChild(headerEl);

    for (const prop of sortedProps) {
      const itemEl = createSettingItem(prop.key, prop.schema, prop.value, prop.isDefault);
      sectionEl.appendChild(itemEl);
    }

    container.appendChild(sectionEl);
  }
}

// ─── Build a single setting item ─────────────────────────────────────────────

function createSettingItem(
  key: string,
  schema: ConfigurationPropertySchema,
  value: unknown,
  isDefault: boolean,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'setting-item';
  item.dataset.settingKey = key;

  // Key label
  const labelRow = document.createElement('div');
  labelRow.className = 'setting-label-row';

  const keyLabel = document.createElement('span');
  keyLabel.className = 'setting-key';
  keyLabel.textContent = key;
  labelRow.appendChild(keyLabel);

  if (!isDefault) {
    const modifiedBadge = document.createElement('span');
    modifiedBadge.className = 'modified-badge';
    modifiedBadge.textContent = '已修改';
    labelRow.appendChild(modifiedBadge);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-btn';
    resetBtn.title = '恢复默认值';
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', async () => {
      await configApi.resetValue(key);
      void loadSettings();
    });
    labelRow.appendChild(resetBtn);
  }

  item.appendChild(labelRow);

  // Description
  if (schema.description) {
    const descEl = document.createElement('div');
    descEl.className = 'setting-description';
    descEl.textContent = schema.description;
    item.appendChild(descEl);
  }

  // Control
  const controlEl = createControl(key, schema, value);
  item.appendChild(controlEl);

  return item;
}

// ─── Create typed control ────────────────────────────────────────────────────

function createControl(
  key: string,
  schema: ConfigurationPropertySchema,
  value: unknown,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  switch (schema.type) {
    case 'boolean':
      return createBooleanControl(key, value as boolean);
    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        return createEnumControl(key, schema, value as string);
      }
      return createStringControl(key, value as string);
    case 'number':
      return createNumberControl(key, schema, value as number);
    case 'array':
    case 'object':
      return createJsonControl(key, value);
    default:
      return createStringControl(key, String(value ?? ''));
  }
}

function createBooleanControl(key: string, value: boolean): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  const label = document.createElement('label');
  label.className = 'checkbox-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(value);
  checkbox.addEventListener('change', () => {
    void configApi.setValue(key, checkbox.checked).then(() => loadSettings());
  });

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(value ? ' 启用' : ' 禁用'));
  wrapper.appendChild(label);
  return wrapper;
}

function createEnumControl(key: string, schema: ConfigurationPropertySchema, value: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  const select = document.createElement('select');
  select.className = 'setting-select';

  for (let i = 0; i < schema.enum!.length; i++) {
    const opt = document.createElement('option');
    opt.value = String(schema.enum![i]);
    opt.textContent = schema.enumDescriptions?.[i] ?? String(schema.enum![i]);
    if (String(schema.enum![i]) === String(value)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    void configApi.setValue(key, select.value).then(() => loadSettings());
  });

  wrapper.appendChild(select);
  return wrapper;
}

function createStringControl(key: string, value: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'setting-input';
  input.value = value ?? '';

  let debounceTimer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void configApi.setValue(key, input.value).then(() => loadSettings());
    }, 500);
  });

  wrapper.appendChild(input);
  return wrapper;
}

function createNumberControl(key: string, schema: ConfigurationPropertySchema, value: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'setting-input';
  input.value = String(value ?? schema.default ?? 0);
  if (schema.minimum !== undefined) input.min = String(schema.minimum);
  if (schema.maximum !== undefined) input.max = String(schema.maximum);

  let debounceTimer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const num = parseFloat(input.value);
      if (!isNaN(num)) {
        void configApi.setValue(key, num).then(() => loadSettings());
      }
    }, 500);
  });

  wrapper.appendChild(input);
  return wrapper;
}

function createJsonControl(key: string, value: unknown): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting-control';

  const textarea = document.createElement('textarea');
  textarea.className = 'setting-textarea';
  textarea.rows = 4;
  textarea.value = JSON.stringify(value ?? (Array.isArray(value) ? [] : {}), null, 2);

  let debounceTimer: ReturnType<typeof setTimeout>;
  textarea.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const parsed = JSON.parse(textarea.value);
        textarea.classList.remove('invalid');
        void configApi.setValue(key, parsed).then(() => loadSettings());
      } catch {
        textarea.classList.add('invalid');
      }
    }, 800);
  });

  wrapper.appendChild(textarea);
  return wrapper;
}

// ─── Search / filter ──────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase().trim();
  const items = container.querySelectorAll('.setting-item');
  const sections = container.querySelectorAll('.settings-section');

  items.forEach((el) => {
    const item = el as HTMLElement;
    const key = (item.dataset.settingKey ?? '').toLowerCase();
    const desc = (item.querySelector('.setting-description')?.textContent ?? '').toLowerCase();
    const visible = !query || key.includes(query) || desc.includes(query);
    item.style.display = visible ? '' : 'none';
  });

  // Hide sections where all items are hidden
  sections.forEach((el) => {
    const section = el as HTMLElement;
    const visibleItems = section.querySelectorAll('.setting-item:not([style*="display: none"])');
    section.style.display = visibleItems.length > 0 ? '' : 'none';
  });
});

// ─── Initialise ──────────────────────────────────────────────────────────────

void loadSettings();

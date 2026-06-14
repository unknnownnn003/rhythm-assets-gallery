type CountItem = {
  name: string;
  count: number;
  value?: string;
};

type FilterPanelProps = {
  categories: CountItem[];
  metaFilters: Array<{
    label: string;
    value: string;
    items: CountItem[];
  }>;
  selectedCategory: string;
  selectedMeta: Record<string, string>;
  sort: string;
  onCategoryChange: (value: string) => void;
  onMetaChange: (key: string, value: string) => void;
  onSortChange: (value: string) => void;
  onClear: () => void;
};

export function FilterPanel({
  categories,
  metaFilters,
  selectedCategory,
  selectedMeta,
  sort,
  onCategoryChange,
  onMetaChange,
  onSortChange,
  onClear,
}: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <div className="filter-panel-head">
        <strong>筛选条件</strong>
        <button type="button" onClick={onClear}>
          清空
        </button>
      </div>

      <label className="filter-field">
        <span>排序</span>
        <select value={sort} onChange={(event) => onSortChange(event.currentTarget.value)}>
          <option value="recent">最近更新</option>
          <option value="name">名称</option>
          <option value="category">分类</option>
        </select>
      </label>

      {metaFilters.map((filter) => (
        <div className="filter-field" key={filter.value}>
          <span>{filter.label}</span>
          <div className="filter-field-row">
            <select
              value={selectedMeta[filter.value] ?? ""}
              onChange={(event) => onMetaChange(filter.value, event.currentTarget.value)}
            >
              <option value="">全部</option>
              {filter.items.map((item) => (
                <option key={item.value ?? item.name} value={item.value ?? item.name}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
            {selectedMeta[filter.value] ? (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => onMetaChange(filter.value, "")}
                title={`清除${filter.label}`}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

import { TagPill } from "./TagPill";

type CountItem = {
  name: string;
  count: number;
};

type FilterPanelProps = {
  categories: CountItem[];
  tags: CountItem[];
  selectedCategory: string;
  selectedTag: string;
  sort: string;
  onCategoryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onClear: () => void;
};

export function FilterPanel({
  categories,
  tags,
  selectedCategory,
  selectedTag,
  sort,
  onCategoryChange,
  onTagChange,
  onSortChange,
  onClear,
}: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <div className="filter-panel-head">
        <strong>筛选</strong>
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

      <div className="filter-group">
        <span>分类</span>
        <div className="filter-options">
          <TagPill
            label="全部"
            active={!selectedCategory}
            onClick={() => onCategoryChange("")}
          />
          {categories.map((category) => (
            <TagPill
              key={category.name}
              label={category.name}
              count={category.count}
              active={selectedCategory === category.name}
              onClick={() => onCategoryChange(category.name)}
            />
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span>标签</span>
        <div className="filter-options">
          <TagPill label="全部" active={!selectedTag} onClick={() => onTagChange("")} />
          {tags.map((tag) => (
            <TagPill
              key={tag.name}
              label={tag.name}
              count={tag.count}
              active={selectedTag === tag.name}
              onClick={() => onTagChange(tag.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
};

export function SearchBar({ value, onChange, resultCount }: SearchBarProps) {
  return (
    <div className="gallery-search">
      <label htmlFor="gallery-search-input">搜索资源</label>
      <div className="gallery-search-row">
        <input
          id="gallery-search-input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="输入曲名、作者、分类、标签或文件名"
          autoComplete="off"
        />
        <span>{resultCount.toLocaleString("zh-CN")} 项</span>
      </div>
    </div>
  );
}

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
};

export function SearchBar({ value, onChange, resultCount }: SearchBarProps) {
  return (
    <div className="gallery-search">
      <label htmlFor="gallery-search-input">搜索</label>
      <div className="gallery-search-row">
        <input
          id="gallery-search-input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="搜曲名、画师、曲包，多个关键词用空格分开"
          autoComplete="off"
        />
        <span>{resultCount.toLocaleString("zh-CN")} 个结果</span>
      </div>
    </div>
  );
}

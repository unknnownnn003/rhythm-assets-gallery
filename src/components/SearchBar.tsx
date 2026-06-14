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
          placeholder="输入多个关键词，例如 对立 6.14 世界模式，或搜索曲绘画师/谱师名称"
          autoComplete="off"
        />
        <span>{resultCount.toLocaleString("zh-CN")} 项结果</span>
      </div>
    </div>
  );
}

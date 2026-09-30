import { Space, Tag } from 'antd'

function CategoryTag({ groups }) {
  const categoryGroups = Array.isArray(groups)
    ? groups
    : []

  if (categoryGroups.length === 0) {
    return null
  }

  return (
    <Space wrap>
      {categoryGroups.map((group) => (
        <Tag
          key={group}
          color="blue"
        >
          {group}
        </Tag>
      ))}
    </Space>
  )
}

export { CategoryTag }
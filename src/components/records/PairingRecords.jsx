import { Empty } from 'antd'

function PairingRecords({
  pairing,
  pairingContact,
  pairingPhone,
  pairingUnit,
  normalizePairingStatus,
}) {
  const hasPairing =
    pairing ||
    pairingContact ||
    pairingPhone ||
    pairingUnit

  if (!hasPairing) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无结对帮扶记录"
      />
    )
  }

  return (
    <div className="detail-grid">
      <DetailItem
        label="是否需要结对帮扶"
        value={normalizePairingStatus(pairing)}
      />

      <DetailItem
        label="帮扶联系人"
        value={pairingContact}
      />

      <DetailItem
        label="联系电话"
        value={pairingPhone}
      />

      <DetailItem
        label="工作单位"
        value={pairingUnit}
      />
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div>{value || '—'}</div>
    </div>
  )
}

export { PairingRecords }
import { Button, Space } from 'antd'

import { RiskRecords } from '../records/RiskRecords'
import { HelpNeeds } from '../records/HelpNeeds'
import { PairingRecords } from '../records/PairingRecords'
import { HelpRecords } from '../records/HelpRecords'
import { CategoryTag } from '../common/CategoryTag'

import {
  getCategoryGroup,
  getCategoryValue,
} from '../../utils/categoryUtils'

import {
  getRiskFilterStatus,
  normalizeRiskStatus,
} from '../../utils/riskUtils'

import {
  getAge,
  firstDefined,
} from '../../utils/youthUtils'

import {
  normalizePairingStatus,
} from '../../utils/pairingUtils'

function YouthDetail({
  record,
  onOpenAllRisks,
}) {
  const groups = getCategoryGroup(
    record.categories,
    record.bigCategory,
  )

  const risks = Array.isArray(record.risks)
    ? record.risks
    : []

  const riskStatus = getRiskFilterStatus(record)

  const helpRecords = Array.isArray(
    record.helpRecordList,
  )
    ? record.helpRecordList
    : []

  /*
   * 详情页只显示最新两条风险排查记录。
   *
   * 当前后端已经按照排查日期从新到旧排序，
   * 因此 risks[0] 是最新一条，risks[1] 是上一条。
   */
  const latestRisks = risks.slice(0, 2)

  return (
    <div className="youth-detail">
      <div className="detail-hero">
        <div>
          <div className="detail-name">
            {record.name || '未命名人员'}
          </div>

          <CategoryTag groups={groups} />
        </div>
      </div>

      <DetailSection title="基本信息">
        <div className="detail-grid">
          <DetailItem
            label="姓名"
            value={record.name}
          />

          <DetailItem
            label="性别"
            value={record.gender}
          />

          <DetailItem
            label="出生年月"
            value={
              record.birthday
                ? String(record.birthday).slice(0, 7)
                : ''
            }
          />

          <DetailItem
            label="年龄"
            value={
              getAge(record.birthday) === null
                ? ''
                : `${getAge(record.birthday)}岁`
            }
          />

          <DetailItem
            label="政治面貌"
            value={record.political}
          />

          <DetailItem
            label="户籍地址"
            value={record.household}
          />

          <DetailItem
            label="常住地址"
            value={record.residence}
          />

          <DetailItem
            label="联系方式"
            value={record.phone}
          />

          <DetailItem
            label="监护人姓名"
            value={record.guardian}
          />

          <DetailItem
            label="监护人联系方式"
            value={record.guardianPhone}
          />

          <DetailItem
            label="是否需要帮扶"
            value={record.helpRequired}
          />
        </div>

        <div className="detail-long-item">
          <div className="detail-label">
            个人基本情况
          </div>

          <div>
            {record.basic || '暂无'}
          </div>
        </div>
      </DetailSection>

      <DetailSection title="困难类别">
        <div className="detail-grid">
          <DetailItem
            label="困难大类"
            value={
              record.bigCategory ||
              groups.join('、')
            }
          />

          <DetailItem
            label="困难小类"
            value={getCategoryValue(record.categories)}
          />
        </div>
      </DetailSection>

      <DetailSection
        title={`风险排查（${risks.length}条）`}
      >
        <RiskRecords
          risks={latestRisks}
          riskStatus={riskStatus}
          normalizeRiskStatus={normalizeRiskStatus}
          firstDefined={firstDefined}
        />

        {risks.length > 2 && (
          <div
            style={{
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            <Button
              type="link"
              onClick={onOpenAllRisks}
            >
              所有排查记录
            </Button>
          </div>
        )}
      </DetailSection>

      <DetailSection
        title={`帮扶需求（${
          Array.isArray(record.helpNeeds)
            ? record.helpNeeds.length
            : 0
        }条）`}
      >
        <HelpNeeds
          helpNeeds={record.helpNeeds}
        />
      </DetailSection>

      <DetailSection title="帮扶记录">
        <HelpRecords
          helpRecords={helpRecords}
        />
      </DetailSection>

      <DetailSection title="结对帮扶">
        <PairingRecords
          pairing={record.pairing}
          pairingContact={record.pairingContact}
          pairingPhone={record.pairingPhone}
          pairingUnit={record.pairingUnit}
          normalizePairingStatus={
            normalizePairingStatus
          }
        />
      </DetailSection>

      <DetailSection title="备注">
        <div>
          {record.remark || '暂无'}
        </div>
      </DetailSection>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <div className="detail-section-title">
        {title}
      </div>

      {children}
    </section>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <div className="detail-label">
        {label}
      </div>

      <div>
        {value || '—'}
      </div>
    </div>
  )
}

export { YouthDetail }
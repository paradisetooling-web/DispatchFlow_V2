import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { SchemaField, OcrResult, OcrLineItem } from '../../types'

// Keys that represent per-item fields (these get replaced by the items table)
const ITEM_LEVEL_KEYS = new Set([
  'item_description', 'item_name', 'hsn_sac_code',
  'quantity', 'unit', 'rate',
])

interface Props {
  fields: SchemaField[]
  ocrResult: OcrResult | null
  initialValues?: Record<string, string>
  onSave: (payload: Record<string, string>) => Promise<void>
  saving?: boolean
  locked?: boolean
}

export function DynamicForm({ fields, ocrResult, initialValues, onSave, saving, locked }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues ?? {})
  const [ocrFilledKeys, setOcrFilledKeys] = useState<Set<string>>(new Set())
  const [warnModal, setWarnModal] = useState<{ open: boolean; missing: string[] }>({ open: false, missing: [] })
  const [lineItems, setLineItems] = useState<OcrLineItem[]>([])
  const [showItems, setShowItems] = useState(false)

  // Sync initialValues when loaded asynchronously (e.g. from IndexedDB / Dexie)
  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      setValues(prev => ({ ...initialValues, ...prev }))
    }
  }, [initialValues])

  // Apply OCR results to form
  useEffect(() => {
    if (!ocrResult || ocrResult.status === 'failed') return
    const filled = new Set<string>()
    const updates: Record<string, string> = {}

    fields.forEach(f => {
      const val = ocrResult.data[f.key]
      if (val) {
        updates[f.key] = val
        filled.add(f.key)
      }
    })

    if (Object.keys(updates).length > 0) {
      setValues(prev => ({ ...prev, ...updates }))
      setOcrFilledKeys(filled)
    }

    const timer = setTimeout(() => setOcrFilledKeys(new Set()), 2000)

    // Set line items if detected
    if (ocrResult.items && ocrResult.items.length > 1) {
      setLineItems(ocrResult.items)
      setShowItems(true)
    } else {
      setLineItems([])
      setShowItems(false)
    }

    return () => clearTimeout(timer)
  }, [ocrResult, fields])

  const hasMultipleItems = lineItems.length > 1

  const handleFieldChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  // When saving, serialize line items into payload
  const handleSaveAttempt = async (e: React.FormEvent) => {
    e.preventDefault()
    const missing = fields.filter(f => f.required && !values[f.key]?.trim())
    if (missing.length > 0) {
      setWarnModal({ open: true, missing: missing.map(f => f.label) })
      return
    }
    const data = { ...values }
    if (hasMultipleItems) {
      data['_line_items'] = JSON.stringify(lineItems)
    }
    await onSave(data)
  }

  const handleSaveAnyway = async () => {
    setWarnModal({ open: false, missing: [] })
    const data = { ...values }
    if (hasMultipleItems) {
      data['_line_items'] = JSON.stringify(lineItems)
    }
    await onSave(data)
  }

  const updateLineItem = (index: number, key: keyof OcrLineItem, value: string) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [key]: value }
      return updated
    })
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  if (!fields || fields.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted">
        No schema fields defined. Please configure your schema in{' '}
        <a href="/settings" className="text-accent underline">Settings</a>.
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSaveAttempt} className="flex flex-col gap-4">
        {fields.map(field => {
          // Hide per-item fields when we have a multi-item table
          if (hasMultipleItems && showItems && ITEM_LEVEL_KEYS.has(field.key)) {
            return null
          }

          const isOcrFilled = ocrFilledKeys.has(field.key)

          return (
            <div key={field.key || field.id} className="flex flex-col gap-0.5">
              <label className="text-sm font-medium text-muted font-body">
                {field.label}
                {field.required && <span className="text-danger ml-0.5">*</span>}
              </label>
              <input
                type={field.type === 'date' ? 'text' : field.type === 'number' ? 'number' : 'text'}
                step={field.type === 'number' ? 'any' : undefined}
                disabled={locked}
                placeholder={field.type === 'date' ? 'DD/MM/YYYY' : `Enter ${(field.label || '').toLowerCase()}`}
                value={values[field.key] ?? ''}
                onChange={e => handleFieldChange(field.key, e.target.value)}
                className={[
                  'w-full rounded border bg-surface px-3 py-2 text-text font-body text-base',
                  'border-border focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] transition-colors duration-80',
                  isOcrFilled ? 'ocr-filled border-l-[3px] border-l-accent' : '',
                ].join(' ')}
              />
            </div>
          )
        })}

        {/* Multi-item line items table */}
        {hasMultipleItems && showItems && (
          <div className="flex flex-col gap-3 border border-accent/30 bg-accent/5 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-heading font-medium text-text">
                  {lineItems.length} Line Items Detected
                </h4>
                <p className="text-xs text-muted">OCR detected multiple items. Edit values below if needed.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowItems(false)}
                className="text-xs text-muted underline"
              >
                Show as single fields instead
              </button>
            </div>

            {lineItems.map((item, idx) => (
              <div key={idx} className="bg-surface border border-border rounded-md p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-accent">Item {idx + 1}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted">Description</label>
                  <input
                    type="text"
                    value={item.item_name}
                    onChange={e => updateLineItem(idx, 'item_name', e.target.value)}
                    disabled={locked}
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text min-h-[36px]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Qty</label>
                    <input
                      type="text"
                      value={item.quantity}
                      onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                      disabled={locked}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text min-h-[36px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Unit</label>
                    <input
                      type="text"
                      value={item.unit}
                      onChange={e => updateLineItem(idx, 'unit', e.target.value)}
                      disabled={locked}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text min-h-[36px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Rate</label>
                    <input
                      type="text"
                      value={item.rate}
                      onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                      disabled={locked}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text min-h-[36px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Total</label>
                    <input
                      type="text"
                      value={item.total_amount}
                      onChange={e => updateLineItem(idx, 'total_amount', e.target.value)}
                      disabled={locked}
                      className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text min-h-[36px]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collapsed items notice */}
        {hasMultipleItems && !showItems && (
          <button
            type="button"
            onClick={() => setShowItems(true)}
            className="text-sm text-accent underline text-left"
          >
            Show {lineItems.length} detected line items
          </button>
        )}

        {locked ? (
          <p className="text-sm text-muted bg-bg border border-border rounded px-3 py-2">
            Edit window closed — this record can no longer be modified.
          </p>
        ) : (
          <Button type="submit" variant="primary" size="lg" loading={saving} className="self-end mt-2">
            Save record
          </Button>
        )}
      </form>

      <Modal
        open={warnModal.open}
        onClose={() => setWarnModal({ open: false, missing: [] })}
        title="Required fields missing"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWarnModal({ open: false, missing: [] })}>Go back and fill</Button>
            <Button variant="danger" onClick={handleSaveAnyway}>Save anyway</Button>
          </>
        }
      >
        <p className="text-sm text-text mb-2">The following required fields are empty:</p>
        <ul className="list-disc ml-5 text-sm text-danger space-y-0.5">
          {warnModal.missing.map(m => <li key={m}>{m}</li>)}
        </ul>
        <p className="text-sm text-muted mt-2">Saving with empty required fields may create incomplete records.</p>
      </Modal>
    </>
  )
}

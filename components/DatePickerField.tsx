import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

interface Props {
  label: string
  value: string        // YYYY-MM-DD or empty string
  onChange: (iso: string) => void
  minDate?: Date
}

export function DatePickerField({ label, value, onChange, minDate }: Props) {
  const [show, setShow] = useState(false)

  // Avoid timezone offset shifting the displayed date
  const parsed = value ? new Date(value + 'T12:00:00') : new Date()
  const formatted = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR')
    : 'Selecionar data'

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false)
    if (selected) onChange(selected.toISOString().split('T')[0])
  }

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.btn} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={15} color={colors.yellow} />
        <Text style={[s.value, !value && s.placeholder]}>{formatted}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.subtext} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setShow(false)} style={s.doneBtn}>
                  <Text style={s.doneText}>Confirmar</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={parsed}
                mode="date"
                display="spinner"
                onChange={handleChange}
                minimumDate={minDate}
                locale="pt-BR"
                style={{ backgroundColor: colors.card }}
                textColor={colors.text}
              />
            </View>
          </View>
        </Modal>
      ) : (
        show && (
          <DateTimePicker
            value={parsed}
            mode="date"
            display="default"
            onChange={handleChange}
            minimumDate={minDate}
          />
        )
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 11, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
  },
  value: { flex: 1, fontSize: 14, color: colors.text },
  placeholder: { color: colors.subtext },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  doneBtn: { backgroundColor: colors.yellow, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  doneText: { fontSize: 13, fontWeight: '800', color: '#0A0A0A' },
})

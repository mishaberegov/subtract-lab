// Runtime status, warning, and export messages augment the static UI dictionary.
export function addMessageCopy(copy) {
  Object.assign(copy, {
    'пока не поддерживается. Экспортируй DICOM без сжатия.':
      'is not supported yet. Export uncompressed DICOM.',
    'Демо · синтетические данные': 'Demo · synthetic data',
    'Корегистрация пока не выполнялась': 'Registration has not been run',
    'Корегистрация завершена': 'Registration complete',
    'Корегистрация с текущими параметрами не выполнялась. Нажми «Корегистрировать»':
      'Registration has not been run with the current settings. Select Register',
    'Серия B смещена вручную': 'Series B moved manually',
    Демо: 'Demo',
    'Синтетические данные': 'Synthetic data',
    'Фантом · до': 'Phantom · before',
    'Фантом · после': 'Phantom · after',
    'Кнопка сброса возвращает масштаб к 1×.': 'Reset zoom returns to 1×.',
    'Колесо / ↑↓ — срезы; протяжка мышью в A или B — окно (по горизонтали WW, по вертикали WL); Shift + протяжка — масштаб. Плоскости следуют осям референса; ориентационные метки учитывают DICOM. Кнопка сброса возвращает масштаб к 1×.':
      'Wheel / ↑↓ — slices; drag in A or B — window (horizontal WW, vertical WL); Shift + drag — zoom. Planes follow reference axes; orientation labels use DICOM. Reset zoom returns to 1×.',
    'Суммарный размер файлов больше 1.5 ГБ. Выбери одну серию.':
      'Total file size exceeds 1.5 GB. Select one series.',
    'Слишком большой файл внутри ZIP.': 'File inside ZIP is too large.',
    'Распакованный ZIP слишком большой.': 'Uncompressed ZIP is too large.',
    'Не найдена подходящая DICOM-серия.': 'No suitable DICOM series found.',
    'Выбери папку с DICOM-файлами или ZIP.': 'Select a folder of DICOM files or a ZIP archive.',
    'Серия не найдена. Выбери файлы повторно.': 'Series not found. Select files again.',
    'Deflated DICOM превышает лимит распакованного размера.':
      'Deflated DICOM exceeds the decompressed size limit.',
    'Siemens MOSAIC нужно экспортировать отдельными срезами или Enhanced DICOM.':
      'Export Siemens MOSAIC as separate slices or Enhanced DICOM.',
    'Modality LUT пока не поддерживается. Нужен экспорт с Rescale Slope/Intercept.':
      'Modality LUT is not supported yet. Export using Rescale Slope/Intercept.',
    'Слишком большой или некорректный DICOM-объём.': 'DICOM volume is too large or invalid.',
    'Поддерживаются только монохромные КТ/МР/ПЭТ-изображения.':
      'Only monochrome CT/MR/PET images are supported.',
    'MONOCHROME1 требует инверсии шкалы; экспортируй серию как MONOCHROME2.':
      'MONOCHROME1 requires intensity inversion; export as MONOCHROME2.',
    'В multiframe-файле нет координат каждого кадра (Enhanced DICOM). Нужен экспорт отдельными срезами.':
      'Multiframe file lacks per-frame coordinates (Enhanced DICOM). Export separate slices.',
    'Некорректные косинусы ориентации DICOM.': 'Invalid DICOM orientation cosines.',
    'Нет SeriesInstanceUID.': 'SeriesInstanceUID is missing.',
    'DICOM-серия': 'DICOM series',
    'В одной позиции несколько срезов. Раздели временные точки, эхо или фазы на отдельные серии.':
      'Multiple slices at one position. Separate time points, echoes, or phases into different series.',
    'Повторяющиеся позиции срезов: смешаны фазы/эхо либо дубликаты файлов.':
      'Duplicate slice positions: mixed phases/echoes or duplicate files.',
    'Неравномерный шаг или пропущенные срезы. Для вычитания нужна регулярная 3D-серия.':
      'Irregular spacing or missing slices. Subtraction requires a regular 3D series.',
    'Слишком большой разрыв между срезами: интерполяция ненадёжна.':
      'Gap between slices is too large for reliable interpolation.',
    'Позиции срезов смещены в плоскости; без пространственного пересчёта интерполяция ненадёжна.':
      'Slices have in-plane position shifts; interpolation without spatial resampling is unreliable.',
    'Интерполировано срезов:': 'Interpolated slices:',
    'Интерполяция не восстанавливает отсутствующие детали; проверь результат перед количественным анализом.':
      'Interpolation cannot restore missing detail; review the result before quantitative analysis.',
    'Некорректный монохромный RLE.': 'Invalid monochrome RLE.',
    'Повреждённый RLE.': 'Corrupt RLE.',
    'Неполный RLE-кадр.': 'Incomplete RLE frame.',
    'Multiframe со сжатием и неоднозначной таблицей фрагментов. Экспортируй отдельные DICOM-срезы.':
      'Compressed multiframe with ambiguous fragment table. Export separate DICOM slices.',
    'Поддерживаются 8-, 16- и 32-битные монохромные пиксели.':
      'Only 8-, 16-, and 32-bit monochrome pixels are supported.',
    'Некорректные BitsStored / HighBit.': 'Invalid BitsStored / HighBit.',
    'Размер PixelData не соответствует кадрам.': 'PixelData size does not match frames.',
    'Не удалось загрузить декодер сжатых DICOM.': 'Could not load compressed DICOM decoder.',
    'Размеры сжатого кадра не совпадают с DICOM.':
      'Compressed frame dimensions do not match DICOM.',
    'Длина декодированного кадра не совпадает с Rows × Columns.':
      'Decoded frame length does not match Rows × Columns.',
    'Объём слишком большой для этой браузерной версии (лимит 100 млн вокселей на серию).':
      'Volume is too large for this browser version (100 million voxels per series).',
    'Две последовательные съёмки перекрываются на одном срезе. Один граничный срез исключён.':
      'Two sequential acquisitions overlap at one slice. One boundary slice was excluded.',
    'Большой объём: разрешение в плоскости уменьшено в':
      'Large volume: in-plane resolution was reduced by a factor of',
    'раза (до': '(to',
    '); исходные срезы по оси Z сохранены.': '); original Z slices were preserved.',
    'Объём слишком большой даже после уменьшения плоскости среза.':
      'Volume is too large even after reducing in-plane resolution.',
    'Некорректный лимит объёма.': 'Invalid volume limit.',
    'В DICOM нет FrameOfReferenceUID: исходное совпадение координат не гарантировано.':
      'DICOM has no FrameOfReferenceUID: initial coordinate alignment is not guaranteed.',
    'Серия использует сжатие с возможной потерей данных.':
      'Series uses potentially lossy compression.',
    'Размеры NIfTI должны быть целыми числами от 1 до 32767.':
      'NIfTI dimensions must be integers from 1 to 32767.',
    'Нет корректных ImagePositionPatient / ImageOrientationPatient / PixelSpacing.':
      'Valid ImagePositionPatient / ImageOrientationPatient / PixelSpacing are missing.',
    'В одной серии смешаны разные размеры, ориентации или PixelSpacing. Выбери одну реконструкцию.':
      'One series contains mixed dimensions, orientations, or PixelSpacing. Choose one reconstruction.'
  });
  Object.assign(copy, {
    'Значения конвертированы в Float16 (погрешность до 1 HU).':
      'Values converted to Float16 (up to 1 HU error).',
    'Ручная коррекция': 'Manual alignment',
    'Прозрачность по интенсивности B': 'B opacity by intensity',
    'Порог прозрачности B': 'B opacity threshold',
    'Макс. непрозрачность B': 'Maximum B opacity',
    'Усреднение срезов · результат': 'Slice averaging · result',
    Усреднение: 'Averaging',
    'Выкл.': 'Off',
    '3 среза': '3 slices',
    '5 срезов': '5 slices',
    'Только «Разница» · PNG с усреднением, NIfTI без него':
      'Difference only · PNG includes averaging; NIfTI does not',
    'Предпросмотр · срез B': 'Preview · B slice',
    'Ч/Б · сетка B': 'Grayscale · B grid',
    'DICOM · наложение': 'DICOM · overlay',
    'LUT наложения': 'Overlay LUT',
    'Чёрно-белое наложение в сетке B, новая производная DICOM-серия исследования B; содержит данные пациента':
      'Grayscale overlay on B grid, new derived DICOM series in B study; contains patient data',
    'Один SeriesInstanceUID относится к разным StudyInstanceUID.':
      'One SeriesInstanceUID belongs to multiple studies.',
    'Серия содержит противоречивые идентификаторы пациента или геометрии.':
      'Series has conflicting patient or geometry identifiers.'
  });
  Object.assign(copy, {
    'перекрытие выбранных точек': 'selected-point overlap',
    'Недостаточно совпадающих точек для надёжной оценки. Проверь совмещение вручную.':
      'Too few matching points for a reliable estimate. Check alignment manually.',
    'Ограниченное перекрытие выбранных точек; проверь совмещение в нескольких срезах и плоскостях.':
      'Limited overlap among selected points; check alignment across several slices and planes.',
    'Проверь совмещение в нескольких срезах и плоскостях; метрика не гарантирует точность.':
      'Check alignment across several slices and planes; the metric does not guarantee accuracy.'
  });
}

"""Run with the optional local evaluation dependencies, not the production server."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
import pyembroidery as pe

spec = importlib.util.spec_from_file_location('quality', Path(__file__).parents[1] / 'scripts/evaluate-digitising-quality.py')
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)

def sample(file, vertical=False, pitch=2, stretch=1):
    pattern = pe.EmbPattern()
    for row in range(0, 201, pitch):
        start, end = ((0, row), (200 * stretch, row))
        if vertical:
            start, end = start[::-1], end[::-1]
        pattern.add_stitch_absolute(pe.JUMP, *start)
        for i in range(1, 6):
            pattern.add_stitch_absolute(pe.STITCH, start[0] + (end[0]-start[0])*i/5, start[1] + (end[1]-start[1])*i/5)
    pattern.add_stitch_absolute(pe.END, *end)
    pe.write_dst(pattern, str(file))

class QualityTest(unittest.TestCase):
    def test_terminal_stop_is_not_an_empty_design_colour(self):
        with tempfile.TemporaryDirectory() as folder:
            a,b=Path(folder)/'plain.dst',Path(folder)/'stop.dst'
            sample(a)
            data=a.read_bytes();end=data.index(bytes([0,0,243]),512)
            b.write_bytes(data[:end]+bytes([0,0,195])+data[end:])
            result=quality.evaluate(a,b)
            self.assertTrue(result['passed'])
            self.assertEqual(result['reference']['trailingEmptyStages'],1)
            # An empty leading/interior block must still fail sequence matching.
            b.write_bytes(data[:512]+bytes([0,0,195])+data[512:])
            self.assertFalse(quality.evaluate(a,b)['gates']['colourSequence'])

    def test_identical_and_negative_controls(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'reference.dst', Path(folder)/'candidate.dst'
            sample(a)
            same = quality.evaluate(a, a)
            self.assertEqual(same['minimumScore'], 100)
            self.assertTrue(same['passed'])
            sample(b, vertical=True)
            wrong_angle = quality.evaluate(b, a)
            self.assertLess(wrong_angle['stages'][0]['direction'], 20)
            self.assertFalse(wrong_angle['passed'])
            sample(b, pitch=8)
            sparse = quality.evaluate(b, a)
            self.assertLess(sparse['stages'][0]['density'], 70)
            self.assertFalse(sparse['passed'])
            sample(b, stretch=1.2)
            self.assertFalse(quality.evaluate(b, a)['gates']['size'])

if __name__ == '__main__':
    unittest.main()

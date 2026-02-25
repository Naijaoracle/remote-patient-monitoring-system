import 'package:flutter_test/flutter_test.dart';
import 'package:rpm_flutter_client/main.dart';

void main() {
  testWidgets('renders rpm title', (WidgetTester tester) async {
    await tester.pumpWidget(const RpmApp());
    expect(find.text('RPM PoA Flutter MVP'), findsOneWidget);
  });
}

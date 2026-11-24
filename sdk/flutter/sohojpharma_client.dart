// SohojPharma Public API — minimal Dart/Flutter client.
// Add `http: ^1.0.0` and `crypto: ^3.0.0` to pubspec.yaml.
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:crypto/crypto.dart';

class SohojPharmaClient {
  final String baseUrl; // e.g. https://sohojpharma.cloud/api/public/v1
  final String apiKey;  // pk_<prefix>.<secret>
  final String? hmacSecret;
  SohojPharmaClient({required this.baseUrl, required this.apiKey, this.hmacSecret});

  Future<Map<String, dynamic>> _req(String method, String path, {Object? body}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'X-API-Key': apiKey, 'Accept': 'application/json'};
    String? payload;
    if (body != null) { payload = jsonEncode(body); headers['Content-Type'] = 'application/json'; }
    if (hmacSecret != null && method != 'GET' && payload != null) {
      final ts = (DateTime.now().millisecondsSinceEpoch ~/ 1000).toString();
      final msg = '$ts.$method.${uri.path}.$payload';
      headers['X-Timestamp'] = ts;
      headers['X-Signature'] = Hmac(sha256, utf8.encode(hmacSecret!)).convert(utf8.encode(msg)).toString();
    }
    final res = await http.Request(method, uri).let((r) {
      r.headers.addAll(headers);
      if (payload != null) r.body = payload;
      return r.send();
    }).then(http.Response.fromStream);
    if (res.statusCode >= 400) throw Exception('SohojPharma ${res.statusCode}: ${res.body}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> products({String? q, String? barcode, int limit = 50, int offset = 0}) =>
      _req('GET', '/products?${Uri(queryParameters: {if (q != null) 'q': q, if (barcode != null) 'barcode': barcode, 'limit': '$limit', 'offset': '$offset'}).query}');
  Future<Map<String, dynamic>> customers({int limit = 50, int offset = 0}) =>
      _req('GET', '/customers?limit=$limit&offset=$offset');
  Future<Map<String, dynamic>> createSale(Map<String, dynamic> body) => _req('POST', '/sales', body: body);
  Future<Map<String, dynamic>> reportsSummary() => _req('GET', '/reports/summary');
}

extension<T> on T { R let<R>(R Function(T) f) => f(this); }

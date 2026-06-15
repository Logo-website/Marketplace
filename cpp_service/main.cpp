// Рекомендатель ко-покупок (P8).
//
// Роль: чистый in-memory lookup. Тяжёлую агрегацию (пары товаров по заказам)
// делает ClickHouse, результат батч-Celery кладёт в общий файл-матрицу, который
// этот сервис грузит в память и перечитывает при изменении (по mtime).
//
// Контракт: GET /...?product_id=N  ->  {"product_id":N,"recommendations":[...]}
// Неизвестный/кривой product_id -> recommendations: [] (Django делает fallback).
//
// Формат файла матрицы (по строке на товар):
//     <product_id> <rec1>,<rec2>,...,<recN>
// Текстовый, а не JSON: парсится без внешних библиотек, надёжно.

#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <sys/stat.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

static std::map<int, std::vector<int>> g_matrix;
static time_t g_mtime = 0;
static std::string g_path;

std::string matrix_path() {
    const char* p = std::getenv("RECOMMENDER_MATRIX_PATH");
    return p ? std::string(p) : std::string("/data/copurchase_matrix.txt");
}

// Перечитывает матрицу, только если файл изменился (один stat на запрос - дёшево).
void reload_if_changed() {
    struct stat st;
    if (stat(g_path.c_str(), &st) != 0) {
        return;  // файла ещё нет - держим текущую (возможно пустую) матрицу
    }
    if (st.st_mtime == g_mtime) {
        return;  // не менялся
    }

    std::map<int, std::vector<int>> fresh;
    std::ifstream in(g_path);
    std::string line;
    while (std::getline(in, line)) {
        std::istringstream ls(line);
        int pid;
        if (!(ls >> pid)) continue;  // первая колонка - product_id
        std::string rest;
        if (!(ls >> rest)) {         // нет сопутствующих
            fresh[pid] = {};
            continue;
        }
        std::vector<int> recs;
        std::stringstream rs(rest);
        std::string tok;
        while (std::getline(rs, tok, ',')) {
            if (tok.empty()) continue;
            try {
                recs.push_back(std::stoi(tok));
            } catch (...) {
                // кривой токен пропускаем, не роняем загрузку
            }
        }
        fresh[pid] = recs;
    }

    g_matrix.swap(fresh);
    g_mtime = st.st_mtime;
    std::cout << "Matrix loaded: " << g_matrix.size() << " products" << std::endl;
}

// Безопасный разбор product_id из строки запроса: только цифры, без исключений,
// с защитой от переполнения. Нет параметра/нечисловой -> -1.
int parse_product_id(const std::string& req) {
    size_t pos = req.find("product_id=");
    if (pos == std::string::npos) return -1;
    pos += std::strlen("product_id=");
    long val = 0;
    bool any = false;
    while (pos < req.size() && req[pos] >= '0' && req[pos] <= '9') {
        val = val * 10 + (req[pos] - '0');
        any = true;
        if (val > 2147483647L) return -1;  // переполнение int -> считаем кривым
        pos++;
    }
    return any ? static_cast<int>(val) : -1;
}

std::string recs_json(int product_id) {
    std::string result = "[";
    auto it = g_matrix.find(product_id);
    if (it != g_matrix.end()) {
        const std::vector<int>& recs = it->second;
        for (size_t i = 0; i < recs.size(); i++) {
            result += std::to_string(recs[i]);
            if (i + 1 < recs.size()) result += ",";
        }
    }
    result += "]";
    return result;
}

std::string handle_request(const std::string& request) {
    reload_if_changed();
    int product_id = parse_product_id(request);
    std::string body = "{\"product_id\":" + std::to_string(product_id) +
                       ",\"recommendations\":" + recs_json(product_id) + "}";
    std::string response = "HTTP/1.1 200 OK\r\n"
                           "Content-Type: application/json\r\n"
                           "Content-Length: " + std::to_string(body.size()) + "\r\n"
                           "\r\n" + body;
    return response;
}

int main() {
    g_path = matrix_path();
    reload_if_changed();

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(8080);

    bind(server_fd, (sockaddr*)&address, sizeof(address));
    listen(server_fd, 10);

    std::cout << "Recommender service running on port 8080 (matrix: " << g_path << ")" << std::endl;

    while (true) {
        int client_fd = accept(server_fd, nullptr, nullptr);
        if (client_fd < 0) continue;
        char buffer[2048] = {};
        read(client_fd, buffer, sizeof(buffer) - 1);
        std::string response = handle_request(std::string(buffer));
        write(client_fd, response.c_str(), response.size());
        close(client_fd);
    }
    return 0;
}

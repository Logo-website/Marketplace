#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

std::map<int, std::vector<int>> recommendations = {
    {1, {101, 102, 103, 104, 105}},
    {2, {201, 202, 203, 204, 205}},
    {3, {301, 302, 303, 304, 305}},
};

std::string get_recommendations(int user_id) {
    std::vector<int> recs;
    if (recommendations.count(user_id)) {
        recs = recommendations[user_id];
    } else {
        recs = {1, 2, 3, 4, 5};
    }
    std::string result = "[";
    for (int i = 0; i < recs.size(); i++) {
        result += std::to_string(recs[i]);
        if (i < recs.size() - 1) result += ",";
    }
    result += "]";
    return result;
}

std::string handle_request(const std::string& request) {
    int user_id = 0;
    size_t pos = request.find("user_id=");
    if (pos != std::string::npos) {
        user_id = std::stoi(request.substr(pos + 8));
    }
    std::string body = "{\"user_id\":" + std::to_string(user_id) +
                       ",\"recommendations\":" + get_recommendations(user_id) + "}";
    std::string response = "HTTP/1.1 200 OK\r\n"
                           "Content-Type: application/json\r\n"
                           "Content-Length: " + std::to_string(body.size()) + "\r\n"
                           "\r\n" + body;
    return response;
}

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(8080);

    bind(server_fd, (sockaddr*)&address, sizeof(address));
    listen(server_fd, 10);

    std::cout << "Recommender service running on port 8080" << std::endl;

    while (true) {
        int client_fd = accept(server_fd, nullptr, nullptr);
        char buffer[1024] = {};
        read(client_fd, buffer, 1024);
        std::string response = handle_request(std::string(buffer));
        write(client_fd, response.c_str(), response.size());
        close(client_fd);
    }
    return 0;
}